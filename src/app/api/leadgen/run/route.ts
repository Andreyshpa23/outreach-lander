/**
 * POST /api/leadgen/run — run leadgen worker for a job_id.
 */

import { NextResponse } from "next/server";
import { runLeadgenWorker } from "@/lib/leadgen/leadgen-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const job_id = body.job_id;
    const input = body.input;
    const hasSegmentIcps = input?.segment_icps?.length > 0;
    const segmentCount = input?.segment_icps?.length ?? 0;
    console.log("[leadgen/run] START job_id=" + job_id + " has_input=" + !!input + " segment_icps=" + segmentCount + " minio_key=" + (input?.minio_key_to_update || "none"));
    if (!job_id || typeof job_id !== "string") {
      return NextResponse.json(
        { error: "job_id required" },
        { status: 400 }
      );
    }
    await runLeadgenWorker(job_id, input);
    const elapsed = Date.now() - startTime;
    console.log("[leadgen/run] FINISHED job_id=" + job_id + " elapsed_ms=" + elapsed);
    return NextResponse.json({ success: true, job_id, elapsed_ms: elapsed });
  } catch (e: any) {
    const elapsed = Date.now() - startTime;
    console.error("[leadgen/run] ERROR job elapsed_ms=" + elapsed + " error:", e?.message ?? e);
    return NextResponse.json(
      { error: e?.message ?? "Unknown error", elapsed_ms: elapsed },
      { status: 500 }
    );
  }
}
