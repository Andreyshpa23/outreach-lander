/**
 * POST /api/leadgen/run — run leadgen worker for a job_id.
 */

import { NextResponse } from "next/server";
import { runLeadgenWorker } from "@/lib/leadgen/leadgen-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const job_id = body.job_id;
    const input = body.input;
    console.log("[leadgen/run] job_id=" + job_id + " has_input=" + !!input);
    if (!job_id || typeof job_id !== "string") {
      return NextResponse.json(
        { error: "job_id required" },
        { status: 400 }
      );
    }
    await runLeadgenWorker(job_id, input);
    console.log("[leadgen/run] worker finished job_id=" + job_id);
    return NextResponse.json({ success: true, job_id });
  } catch (e: any) {
    console.error("Leadgen run error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
