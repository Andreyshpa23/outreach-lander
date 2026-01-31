/**
 * POST /api/leadgen — create job, trigger run, return job_id + results_url.
 */

import { NextResponse } from "next/server";
import { createJob, generateJobId } from "@/lib/leadgen/job-store";
import type { LeadgenJobInput, Icp, IcpGeo, IcpPositions, IcpCompanySize } from "@/lib/leadgen/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeIcp(body: any): Icp {
  const icp = body.icp ?? {};
  const geo = icp.geo;
  const positions = icp.positions;
  const companySize = icp.company_size;
  return {
    geo:
      geo && typeof geo === "object"
        ? ({
            countries: Array.isArray(geo.countries) ? geo.countries : undefined,
            regions: Array.isArray(geo.regions) ? geo.regions : undefined,
            cities: Array.isArray(geo.cities) ? geo.cities : undefined,
          } as IcpGeo)
        : undefined,
    positions:
      positions && typeof positions === "object"
        ? ({
            titles_strict: Array.isArray(positions.titles_strict) ? positions.titles_strict : undefined,
            titles_broad: Array.isArray(positions.titles_broad) ? positions.titles_broad : undefined,
            seniority: Array.isArray(positions.seniority) ? positions.seniority : undefined,
            departments: Array.isArray(positions.departments) ? positions.departments : undefined,
          } as IcpPositions)
        : undefined,
    industries: Array.isArray(icp.industries) ? icp.industries : undefined,
    company_size:
      companySize && typeof companySize === "object" && Array.isArray(companySize.employee_ranges)
        ? ({ employee_ranges: companySize.employee_ranges } as IcpCompanySize)
        : undefined,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const job_id = body.job_id ?? generateJobId();
    const icp = normalizeIcp(body);
    const limits = body.limits ?? {};
    const input: LeadgenJobInput = {
      job_id,
      icp,
      limits: {
        target_leads: limits.target_leads ?? 100,
        max_runtime_ms: limits.max_runtime_ms ?? 45000,
      },
    };

    createJob(job_id, input);

    // Use request origin in dev so run is triggered on same host/port
    const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
    const proto = req.headers.get("x-forwarded-proto") || (host && host.includes("localhost") ? "http" : "https");
    const origin =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL ?? (host ? `${proto}://${host}` : "http://localhost:3000");
    const resultsUrl = `${origin}/api/leadgen/${job_id}`;

    // Trigger worker (fire-and-forget)
    fetch(`${origin}/api/leadgen/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id }),
    }).catch((err) => console.error("Leadgen run trigger error:", err));

    return NextResponse.json({
      job_id,
      results_url: resultsUrl,
    });
  } catch (e: any) {
    console.error("Leadgen POST error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
