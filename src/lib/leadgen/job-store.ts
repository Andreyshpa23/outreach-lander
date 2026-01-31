/**
 * Job store: in-memory + optional file persist for GET /leadgen/{job_id}.
 */

import type { LeadgenJobInput, LeadgenJobResult } from "./types";
import fs from "fs";
import path from "path";

const JOBS_DIR = path.join(process.cwd(), ".leadgen-jobs");
const MEMORY = new Map<string, LeadgenJobResult & { input?: LeadgenJobInput }>();

function ensureJobsDir() {
  if (typeof fs.existsSync === "undefined") return;
  if (!fs.existsSync(JOBS_DIR)) {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
  }
}

function jobPath(jobId: string): string {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

export function createJob(
  jobId: string,
  input: LeadgenJobInput
): LeadgenJobResult & { input?: LeadgenJobInput } {
  const now = new Date().toISOString();
  const job: LeadgenJobResult & { input?: LeadgenJobInput } = {
    job_id: jobId,
    status: "queued",
    icp_used: input.icp,
    leads_count: 0,
    linkedin_urls: [],
    leads_preview: [],
    download_csv_url: null,
    debug: {},
    error: null,
    created_at: now,
    updated_at: now,
    input,
  };
  MEMORY.set(jobId, job);
  try {
    ensureJobsDir();
    fs.writeFileSync(
      jobPath(jobId),
      JSON.stringify(job, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.error("Job store write error:", e);
  }
  return job;
}

/** Prefer file over memory so GET sees updates from run in another process (e.g. dev server). */
export function getJob(jobId: string): (LeadgenJobResult & { input?: LeadgenJobInput }) | null {
  try {
    const fp = jobPath(jobId);
    if (typeof fs.existsSync !== "undefined" && fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, "utf-8");
      const job = JSON.parse(raw) as LeadgenJobResult & { input?: LeadgenJobInput };
      MEMORY.set(jobId, job);
      return job;
    }
  } catch (e) {
    console.error("Job store read error:", e);
  }
  const mem = MEMORY.get(jobId);
  if (mem) return mem;
  return null;
}

export function updateJob(
  jobId: string,
  update: Partial<LeadgenJobResult>
): (LeadgenJobResult & { input?: LeadgenJobInput }) | null {
  const job = getJob(jobId);
  if (!job) return null;
  const updated = {
    ...job,
    ...update,
    updated_at: new Date().toISOString(),
  };
  MEMORY.set(jobId, updated);
  try {
    ensureJobsDir();
    fs.writeFileSync(
      jobPath(jobId),
      JSON.stringify(updated, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.error("Job store update error:", e);
  }
  return updated;
}

export function generateJobId(): string {
  return `lg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
