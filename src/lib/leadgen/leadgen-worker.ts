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

const TARGET_LEADS_DEFAULT = 100;
const MAX_RUNTIME_MS_DEFAULT = 45000;
const PER_PAGE = 100;
const PREVIEW_SIZE = 50;

export async function runLeadgenWorker(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job || !job.input) {
    updateJob(jobId, { status: "failed", error: "Job or input not found" });
    return;
  }
  if (job.status !== "queued") {
    return;
  }

  const input = job.input as LeadgenJobInput;
  const icp = input.icp;
  const targetLeads = input.limits?.target_leads ?? TARGET_LEADS_DEFAULT;
  const maxRuntimeMs = input.limits?.max_runtime_ms ?? MAX_RUNTIME_MS_DEFAULT;
  const deadline = Date.now() + maxRuntimeMs;

  updateJob(jobId, { status: "running" });

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

    const filters = mapIcpToApolloFilters(icp, step as WideningStep);
    const hasFilters = Object.keys(filters).some(
      (k) => Array.isArray((filters as Record<string, unknown>)[k]) && ((filters as Record<string, unknown>)[k] as unknown[]).length > 0
    );
    if (!hasFilters && step === "strict") {
      wideningStepsApplied.push("strict");
      continue;
    }

    wideningStepsApplied.push(step);
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
  let download_csv_url: string | null = null;

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

  updateJob(jobId, {
    status: "done",
    icp_used: icp,
    leads_count: finalLeads.length,
    leads_preview: finalLeads.slice(0, PREVIEW_SIZE),
    download_csv_url,
    debug: {
      apollo_requests: apolloRequests,
      widening_steps_applied: wideningStepsApplied,
      partial_due_to_timeout: partialDueToTimeout,
    },
    error: partialDueToTimeout
      ? `Stopped at ${finalLeads.length} leads due to timeout`
      : finalLeads.length < targetLeads
        ? `Collected ${finalLeads.length} leads (target ${targetLeads})`
        : null,
  });
}
