/**
 * Leadgen worker: progressive widening, Apollo search, dedupe, CSV upload.
 * При segment_icps — разный ICP на сегмент, ищем разных людей по сегментам.
 * В MinIO только leads (ссылки на LinkedIn), без leads_detail.
 */

import type { LeadgenJobInput, Lead, Icp, WideningStep } from "./types";
import { getJob, updateJob } from "./job-store";
import { searchPeople, enrichPerson } from "./apollo-client";
import type { ApolloPerson } from "./apollo-client";
import { mapIcpToApolloFilters, getWideningSteps } from "./icp-to-apollo";
import { normalizePerson, isLeadValid, onlyLinkedInUrl } from "./normalize";
import { buildCsv, getCsvFilename } from "./csv-export";
import { uploadCsv, getPresignedDownloadUrl, isStorageConfigured } from "./storage";
import { uploadDemoImportToS3 } from "@/lib/demo-import-storage";

const TARGET_LEADS_DEFAULT = 100;
const MAX_RUNTIME_MS_DEFAULT = 45000;
const PER_PAGE = 100;
const PREVIEW_SIZE = 50;

export interface RunSearchResult {
  linkedin_urls: string[];
  leads: Lead[];
  apolloRequests: number;
  wideningStepsApplied: string[];
  partialDueToTimeout: boolean;
}

/** Check if ICP has any meaningful content */
function isIcpEmpty(icp: Icp): boolean {
  const hasGeo = (icp.geo?.countries?.length ?? 0) > 0 ||
                 (icp.geo?.regions?.length ?? 0) > 0 ||
                 (icp.geo?.cities?.length ?? 0) > 0;
  const hasPositions = (icp.positions?.titles_strict?.length ?? 0) > 0 ||
                      (icp.positions?.titles_broad?.length ?? 0) > 0 ||
                      (icp.positions?.seniority?.length ?? 0) > 0 ||
                      (icp.positions?.departments?.length ?? 0) > 0;
  const hasIndustries = (icp.industries?.length ?? 0) > 0;
  const hasKeywords = (icp.industry_keywords?.length ?? 0) > 0;
  const hasCompanySize = (icp.company_size?.employee_ranges?.length ?? 0) > 0;
  return !hasGeo && !hasPositions && !hasIndustries && !hasKeywords && !hasCompanySize;
}

/** Один прогон Apollo по ICP: поиск + обогащение, возвращает ссылки и лиды. */
async function runSearchForIcp(
  icp: Icp,
  targetLeads: number,
  deadline: number,
  productName: string,
  segmentLabel?: string
): Promise<RunSearchResult> {
  let resolvedIcp = icp;
  if (isIcpEmpty(icp) && productName) {
    resolvedIcp = { ...icp, industry_keywords: [productName] };
    console.log("[leadgen] empty ICP for", segmentLabel || "segment", ", fallback to productName:", productName);
  }
  console.log("[leadgen] runSearchForIcp", segmentLabel || "-", "icp:", JSON.stringify(resolvedIcp).slice(0, 300));
  const seen = new Set<string>();
  const leads: Lead[] = [];
  const wideningStepsApplied: string[] = [];
  let apolloRequests = 0;
  let partialDueToTimeout = false;
  const steps = getWideningSteps();

  for (const step of steps) {
    if (Date.now() >= deadline) {
      partialDueToTimeout = true;
      break;
    }
    if (leads.length >= targetLeads) break;

    const filters = mapIcpToApolloFilters(resolvedIcp, step as WideningStep);
    const hasFilters = Object.keys(filters).some((k) => {
      const v = (filters as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "string") return v.trim().length > 0;
      return false;
    });
    if (!hasFilters && step === "strict") {
      wideningStepsApplied.push("strict");
      continue;
    }

    wideningStepsApplied.push(step);
    let page = 1;
    let hasMore = true;

    while (hasMore && leads.length < targetLeads && Date.now() < deadline) {
      const res = await searchPeople(filters, page, PER_PAGE);
      apolloRequests++;
      const people = (res.people ?? []) as ApolloPerson[];
      if (people.length === 0) {
        hasMore = false;
        break;
      }
      for (const person of people) {
        const lead = normalizePerson(person);
        if (!isLeadValid(lead)) continue;
        const dedupeKey = lead.linkedin_url || lead.apollo_person_id;
        if (!dedupeKey || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        leads.push(lead);
        if (leads.length >= targetLeads) break;
      }
      const totalPages = (res.pagination as { total_pages?: number })?.total_pages ?? 1;
      if (page >= totalPages || people.length < PER_PAGE) hasMore = false;
      else page++;
    }
    if (leads.length >= targetLeads) break;
  }

  const finalLeads = leads.slice(0, targetLeads);
  const enrichLimit = Math.min(
    Math.max(0, parseInt(process.env.APOLLO_ENRICH_FOR_LINKEDIN_LIMIT ?? String(targetLeads), 10) || targetLeads),
    targetLeads
  );
  const ENRICH_DELAY_MS = 150;
  const deadlineForEnrich = deadline - 8000;
  if (enrichLimit > 0 && Date.now() < deadlineForEnrich) {
    const withoutLinkedIn = finalLeads.filter((l) => !onlyLinkedInUrl(l.linkedin_url));
    let enriched = 0;
    let attempted = 0;
    for (const lead of withoutLinkedIn) {
      if (enriched >= enrichLimit || Date.now() >= deadlineForEnrich) break;
      if (attempted > 0) await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
      attempted++;
      const parts = (lead.full_name ?? "").trim().split(/\s+/);
      const first_name = parts[0] ?? "";
      const last_name = parts.slice(1).join(" ") ?? "";
      let domain = "";
      try {
        if (lead.company_website?.trim()) domain = new URL(lead.company_website.replace(/^\/+/, "https://")).hostname.replace(/^www\./, "");
      } catch {}
      const result = await enrichPerson({
        first_name,
        last_name,
        domain: domain || undefined,
        person_id: lead.apollo_person_id || undefined,
      });
      if (result?.linkedin_url) {
        lead.linkedin_url = result.linkedin_url;
        enriched++;
      }
    }
    if (segmentLabel && enriched > 0) console.log("[leadgen] segment=" + segmentLabel + " enriched " + enriched + " with LinkedIn");
  }
  const linkedin_urls = finalLeads.map((l) => onlyLinkedInUrl(l.linkedin_url)).filter(Boolean);
  return { linkedin_urls, leads: finalLeads, apolloRequests, wideningStepsApplied, partialDueToTimeout };
}

export async function runLeadgenWorker(jobId: string, inputOverride?: LeadgenJobInput): Promise<void> {
  const workerStart = Date.now();
  console.log("[leadgen-worker] START job_id=" + jobId + " has_inputOverride=" + !!inputOverride);
  const job = inputOverride ? null : getJob(jobId);
  const input = inputOverride ?? job?.input;
  if (!input) {
    console.error("[leadgen-worker] FAIL: no input for job_id=" + jobId);
    if (!inputOverride) updateJob(jobId, { status: "failed", error: "Job or input not found" });
    return;
  }
  if (!inputOverride && job && job.status !== "queued") {
    console.log("[leadgen-worker] SKIP: job not queued, status=" + job.status);
    return;
  }
  if (!inputOverride) {
    updateJob(jobId, { status: "running" });
  }
  console.log("[leadgen-worker] job_id=" + jobId + " segment_icps=" + (input.segment_icps?.length ?? 0) + " minio_key=" + (input.minio_key_to_update || "none"));

  const targetLeads = input.limits?.target_leads ?? TARGET_LEADS_DEFAULT;
  const maxRuntimeMs = input.limits?.max_runtime_ms ?? MAX_RUNTIME_MS_DEFAULT;
  const deadline = Date.now() + maxRuntimeMs;
  const minioPayload = (input as LeadgenJobInput).minio_payload;
  const productName = minioPayload?.product?.name ?? "";

  let segmentLinkedInUrls: string[][] = [];
  let allLeads: Lead[] = [];
  let totalApolloRequests = 0;
  const allWideningSteps: string[] = [];
  let partialDueToTimeout = false;

  if (input.segment_icps && input.segment_icps.length > 0) {
    console.log("[leadgen] job_id=" + jobId + " per-segment ICP, segments=" + input.segment_icps.length);
    const timePerSegment = Math.max(3000, Math.floor(maxRuntimeMs / input.segment_icps.length));
    for (const { segment_index, icp } of input.segment_icps) {
      if (Date.now() >= deadline) {
        console.log("[leadgen] global deadline reached before segment", segment_index);
        partialDueToTimeout = true;
        break;
      }
      const segmentLabel = minioPayload?.segments?.[segment_index]?.name ?? "seg" + segment_index;
      const segmentDeadline = Math.min(Date.now() + timePerSegment, deadline);
      try {
        const result = await runSearchForIcp(icp, targetLeads, segmentDeadline, productName, segmentLabel);
        segmentLinkedInUrls[segment_index] = result.linkedin_urls;
        allLeads = allLeads.concat(result.leads);
        totalApolloRequests += result.apolloRequests;
        result.wideningStepsApplied.forEach((s) => allWideningSteps.push(segmentLabel + ":" + s));
        if (result.partialDueToTimeout) partialDueToTimeout = true;
        console.log("[leadgen] segment=" + segmentLabel + " linkedin_urls=" + result.linkedin_urls.length);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        updateJob(jobId, {
          status: "failed",
          error: "Segment " + segment_index + ": " + errMsg,
          leads_count: allLeads.length,
          leads_preview: allLeads.slice(0, PREVIEW_SIZE),
          download_csv_url: null,
          debug: { apollo_requests: totalApolloRequests, widening_steps_applied: allWideningSteps },
        });
        return;
      }
    }
    // Выравниваем массив под индексы сегментов (могут быть пропуски)
    const segmentsCount = minioPayload?.segments?.length ?? segmentLinkedInUrls.length;
    for (let i = 0; i < segmentsCount; i++) {
      if (segmentLinkedInUrls[i] == null) segmentLinkedInUrls[i] = [];
    }
  } else {
    const icp = input.icp;
    console.log("[leadgen] job_id=" + jobId + " single ICP (no segment_icps) minio_key_to_update=" + (input as LeadgenJobInput).minio_key_to_update);
    try {
      const result = await runSearchForIcp(icp, targetLeads, deadline, productName);
      segmentLinkedInUrls = (minioPayload?.segments ?? []).map(() => result.linkedin_urls);
      allLeads = result.leads;
      totalApolloRequests = result.apolloRequests;
      allWideningSteps.push(...result.wideningStepsApplied);
      partialDueToTimeout = result.partialDueToTimeout;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      updateJob(jobId, {
        status: "failed",
        error: errMsg,
        leads_count: 0,
        leads_preview: [],
        download_csv_url: null,
        debug: {},
      });
      return;
    }
  }

  const totalLinkedIn = segmentLinkedInUrls.flat().length;
  console.log("[leadgen] done leads=" + allLeads.length + " linkedin_total=" + totalLinkedIn + " apollo_requests=" + totalApolloRequests + " partial=" + partialDueToTimeout);

  let download_csv_url: string | null = null;
  let minio_object_key: string | null = null;

  if (allLeads.length > 0 && isStorageConfigured()) {
    try {
      const csvFilename = getCsvFilename(jobId);
      const csvBody = buildCsv(allLeads);
      await uploadCsv(csvFilename, csvBody);
      download_csv_url = await getPresignedDownloadUrl(csvFilename);
      console.log("[leadgen] CSV uploaded key=" + csvFilename + " rows=" + allLeads.length);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("[leadgen] CSV upload failed:", errMsg, e);
    }
  }

  const minioKeyToUpdate = (input as LeadgenJobInput).minio_key_to_update;
  const shouldUpdateMinio =
    minioPayload?.product &&
    minioPayload?.segments?.length &&
    (totalLinkedIn > 0 || minioKeyToUpdate);
  let minioError: string | undefined;
  if (shouldUpdateMinio) {
    try {
      const payload = {
        product: {
          name: minioPayload!.product.name,
          description: minioPayload!.product.description,
          goal_type: minioPayload!.product.goal_type || "MANUAL_GOAL",
          goal_description: minioPayload!.product.goal_description || "",
        },
        segments: minioPayload!.segments.map((s, i) => ({
          name: s.name,
          personalization: s.personalization,
          leads: segmentLinkedInUrls[i] ?? [],
          ...(s.outreach_personalization != null && { outreach_personalization: s.outreach_personalization }),
          ...(s.dialog_personalization != null && { dialog_personalization: s.dialog_personalization }),
        })),
      };
      const { objectKey } = await uploadDemoImportToS3(payload, minioKeyToUpdate);
      minio_object_key = objectKey;
      console.log("[leadgen] MinIO updated objectKey=" + objectKey + " (leads only, no leads_detail)");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      minioError = errMsg;
      console.error("Leadgen MinIO upload error:", errMsg, e);
    }
  }

  const linkedin_urls = segmentLinkedInUrls.flat();
  updateJob(jobId, {
    status: "done",
    icp_used: input.icp,
    leads_count: allLeads.length,
    linkedin_urls,
    leads_preview: allLeads.slice(0, PREVIEW_SIZE),
    download_csv_url,
    minio_object_key: minio_object_key ?? undefined,
    debug: {
      apollo_requests: totalApolloRequests,
      widening_steps_applied: allWideningSteps,
      partial_due_to_timeout: partialDueToTimeout,
      ...(minioError != null && { minio_error: minioError }),
    },
    error: partialDueToTimeout
      ? `Stopped at ${allLeads.length} leads due to timeout`
      : allLeads.length < targetLeads
        ? `Collected ${allLeads.length} leads (target ${targetLeads})`
        : null,
  });
}
