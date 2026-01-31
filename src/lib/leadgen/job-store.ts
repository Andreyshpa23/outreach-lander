/**
 * Job store: in-memory + optional file persist for GET /leadgen/{job_id}.
 */

import type { LeadgenJobInput, LeadgenJobResult } from "./types";
import fs from "fs";
import path from "path";

const MEMORY = new Map<string, LeadgenJobResult & { input?: LeadgenJobInput }>();

// Detect Vercel/serverless environment at runtime (not at module load)
function isVercelEnvironment(): boolean {
  // Check multiple indicators
  if (process.env.VERCEL || process.env.VERCEL_ENV) return true;
  const cwd = process.cwd();
  if (cwd === '/var/task') return true;
  if (cwd.startsWith('/var/task/')) return true;
  return false;
}

function getJobsDir(): string {
  if (isVercelEnvironment()) {
    return path.join('/tmp', '.leadgen-jobs');
  }
  return path.join(process.cwd(), ".leadgen-jobs");
}

function ensureJobsDir() {
  // Always check at runtime
  if (isVercelEnvironment() || typeof fs.existsSync === "undefined") {
    return;
  }
  
  const jobsDir = getJobsDir();
  
  // Final safety check: never create directories in /var/task
  if (jobsDir.includes('/var/task')) {
    console.warn('[job-store] Blocked: attempted to create dir in /var/task:', jobsDir);
    return;
  }
  
  try {
    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }
  } catch (error) {
    // If directory creation fails (e.g., in strict serverless), use in-memory only
    console.warn('[job-store] Failed to create jobs dir, using in-memory storage:', error);
  }
}

function jobPath(jobId: string): string {
  return path.join(getJobsDir(), `${jobId}.json`);
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
  // Always check at runtime
  if (!isVercelEnvironment()) {
    try {
      ensureJobsDir();
      const filePath = jobPath(jobId);
      // Final safety check before writing
      if (!filePath.includes('/var/task') && fs.writeFileSync) {
        fs.writeFileSync(filePath, JSON.stringify(job, null, 2), "utf-8");
      }
    } catch (e) {
      console.error("Job store write error:", e);
    }
  }
  return job;
}

/** Prefer file over memory so GET sees updates from run in another process (e.g. dev server). */
export function getJob(jobId: string): (LeadgenJobResult & { input?: LeadgenJobInput }) | null {
  // Try memory first (always available)
  const mem = MEMORY.get(jobId);
  if (mem) return mem;
  
  // Always check at runtime
  if (!isVercelEnvironment()) {
    try {
      const fp = jobPath(jobId);
      // Final safety check before reading
      if (!fp.includes('/var/task') && typeof fs.existsSync !== "undefined" && fs.existsSync(fp)) {
        const raw = fs.readFileSync(fp, "utf-8");
        const job = JSON.parse(raw) as LeadgenJobResult & { input?: LeadgenJobInput };
        MEMORY.set(jobId, job);
        return job;
      }
    } catch (e) {
      console.error("Job store read error:", e);
    }
  }
  
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
  // Always check at runtime
  if (!isVercelEnvironment()) {
    try {
      ensureJobsDir();
      const filePath = jobPath(jobId);
      // Final safety check before writing
      if (!filePath.includes('/var/task') && fs.writeFileSync) {
        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");
      }
    } catch (e) {
      console.error("Job store update error:", e);
    }
  }
  return updated;
}

export function generateJobId(): string {
  return `lg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
