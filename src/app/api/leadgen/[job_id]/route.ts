/**
 * GET /api/leadgen/{job_id} — return job result JSON (2.1).
 */

import { NextResponse } from "next/server";
import { getJob } from "@/lib/leadgen/job-store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    if (!job_id) {
      return NextResponse.json(
        { error: "job_id required" },
        { status: 400 }
      );
    }
    const job = getJob(job_id);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }
    const { input, ...result } = job;
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("Leadgen GET error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
