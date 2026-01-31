/**
 * Leadgen worker: progressive widening, Apollo search, dedupe, CSV upload.
 */

import type { LeadgenJobInput, Lead, Icp, WideningStep } from "./types";
import { getJob, updateJob } from "./job-store";
import { searchPeople } from "./apollo-client";
import type { ApolloPerson } from "./apollo-client";
import { mapIcpToApolloFilters, getWideningSteps } from "./icp-to-apollo";
import { normalizePerson, isLeadValid } from "./normalize";
import { buildCsv, getCsvFilename } from "./csv-export";
import { uploadCsv, getPresignedDownloadUrl, isStorageConfigured } from "./storage";
import { uploadDemoImportToS3 } from "@/lib/demo-import-storage";

const TARGET_LEADS_DEFAULT = 100;
const MAX_RUNTIME_MS_DEFAULT = 45000;
const PER_PAGE = 100;
const PREVIEW_SIZE = 50;

export async function runLeadgenWorker(jobId: string, inputOverride?: LeadgenJobInput): Promise<void> {
  const job = inputOverride ? null : getJob(jobId);
  const input = inputOverride ?? job?.input;
  if (!input) {
    if (!inputOverride) updateJob(jobId, { status: "failed", error: "Job or input not found" });
    return;
  }
  if (!inputOverride && job && job.status !== "queued") {
    return;
  }
  if (!inputOverride) {
    updateJob(jobId, { status: "running" });
  }
  let icp = input.icp;
  if (Object.keys(icp).length === 0 && (input as LeadgenJobInput).minio_payload?.product?.name) {
    icp = { ...icp, industry_keywords: [(input as LeadgenJobInput).minio_payload!.product.name] };
    console.log("[leadgen] empty ICP, fallback q_keywords from product name");
  }
  const targetLeads = input.limits?.target_leads ?? TARGET_LEADS_DEFAULT;
  const maxRuntimeMs = input.limits?.max_runtime_ms ?? MAX_RUNTIME_MS_DEFAULT;
  const deadline = Date.now() + maxRuntimeMs;

  const seen = new Set<string>();
  const leads: Lead[] = [];
  const wideningStepsApplied: string[] = [];
  let apolloRequests = 0;
  let partialDueToTimeout = false;

  const steps = getWideningSteps();
  console.log("[leadgen] job_id=" + jobId + " icp_keys=" + JSON.stringify(Object.keys(icp)) + " minio_key_to_update=" + (input as LeadgenJobInput).minio_key_to_update);

  for (const step of steps) {
    if (Date.now() >= deadline) {
      console.log("[leadgen] deadline reached, stopping. leads=" + leads.length + " apollo_requests=" + apolloRequests);
      partialDueToTimeout = true;
      break;
    }
    if (leads.length >= targetLeads) break;

    const filters = mapIcpToApolloFilters(icp, step as WideningStep);
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
    console.log("[leadgen] step=" + step + " filters=" + JSON.stringify(Object.keys(filters)));
    let page = 1;
    let hasMore = true;

    while (hasMore && leads.length < targetLeads && Date.now() < deadline) {
      try {
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
        if (page >= totalPages || people.length < PER_PAGE) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        updateJob(jobId, {
          status: "failed",
          error: errMsg,
          leads_count: leads.length,
          leads_preview: leads.slice(0, PREVIEW_SIZE),
          download_csv_url: null,
          debug: {
            apollo_requests: apolloRequests,
            widening_steps_applied: wideningStepsApplied,
          },
        });
        return;
      }
    }

    if (leads.length >= targetLeads) break;
  }

  const finalLeads = leads.slice(0, targetLeads);
  const linkedin_urls = finalLeads.map((l) => l.linkedin_url).filter(Boolean);
  console.log("[leadgen] done leads_count=" + finalLeads.length + " apollo_requests=" + apolloRequests + " partial_due_to_timeout=" + partialDueToTimeout);

  let download_csv_url: string | null = null;
  let minio_object_key: string | null = null;

  if (finalLeads.length > 0 && isStorageConfigured()) {
    try {
      const csvFilename = getCsvFilename(jobId);
      const csvBody = buildCsv(finalLeads);
      await uploadCsv(csvFilename, csvBody);
      download_csv_url = await getPresignedDownloadUrl(csvFilename);
    } catch (e) {
      console.error("Leadgen CSV upload error:", e);
    }
  }

  let minioError: string | undefined;
  const minioPayload = (input as LeadgenJobInput).minio_payload;
  const minioKeyToUpdate = (input as LeadgenJobInput).minio_key_to_update;
  const shouldUpdateMinio =
    minioPayload?.product &&
    minioPayload?.segments?.length &&
    (linkedin_urls.length > 0 || minioKeyToUpdate);
  if (shouldUpdateMinio) {
    try {
      console.log("[leadgen] MinIO update key=" + minioKeyToUpdate + " linkedin_urls=" + linkedin_urls.length);
      const product = minioPayload!.product;
      const leads_detail = finalLeads.map((l) => ({
        linkedin_url: l.linkedin_url,
        full_name: l.full_name,
        title: l.title,
        company_name: l.company_name,
      }));
      const payload = {
        product: {
          name: product.name,
          description: product.description,
          goal_type: product.goal_type || "MANUAL_GOAL",
          goal_description: product.goal_description || "",
        },
        segments: minioPayload!.segments.map((s) => ({
          name: s.name,
          personalization: s.personalization,
          leads: linkedin_urls,
          leads_detail,
          ...(s.outreach_personalization != null && { outreach_personalization: s.outreach_personalization }),
          ...(s.dialog_personalization != null && { dialog_personalization: s.dialog_personalization }),
        })),
      };
      const { objectKey } = await uploadDemoImportToS3(payload, minioKeyToUpdate);
      minio_object_key = objectKey;
      console.log("[leadgen] MinIO updated objectKey=" + objectKey);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      minioError = errMsg;
      console.error("Leadgen MinIO upload error:", errMsg, e);
    }
  }

  updateJob(jobId, {
    status: "done",
    icp_used: icp,
    leads_count: finalLeads.length,
    linkedin_urls,
    leads_preview: finalLeads.slice(0, PREVIEW_SIZE),
    download_csv_url,
    minio_object_key: minio_object_key ?? undefined,
    debug: {
      apollo_requests: apolloRequests,
      widening_steps_applied: wideningStepsApplied,
      partial_due_to_timeout: partialDueToTimeout,
      ...(minioError != null && { minio_error: minioError }),
    },
    error: partialDueToTimeout
      ? `Stopped at ${finalLeads.length} leads due to timeout`
      : finalLeads.length < targetLeads
        ? `Collected ${finalLeads.length} leads (target ${targetLeads})`
        : null,
  });
}
