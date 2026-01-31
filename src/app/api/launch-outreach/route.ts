/**
 * POST /api/launch-outreach
 * Сразу создаём файл в MinIO (product + segments с leads: []), кладём key в cookie.
 * В фоне запускаем Apollo leadgen; по завершении дополняем тот же файл ссылками на LinkedIn.
 */

import { NextResponse } from "next/server";
import {
  DemoImportPayload,
  uploadDemoImportToS3,
  validateDemoImportPayload,
} from "@/lib/demo-import-storage";
import { createJob, generateJobId } from "@/lib/leadgen/job-store";
import type { LeadgenJobInput, Icp, IcpGeo, IcpPositions, IcpCompanySize } from "@/lib/leadgen/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type TargetAudienceBody = {
  geo?: string;
  positions?: string[];
  industry?: string;
  company_size?: string;
};

function targetAudienceToIcp(ta: TargetAudienceBody): Icp {
  const countries = ta.geo ? ta.geo.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const industries = ta.industry ? ta.industry.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const employeeRanges = ta.company_size
    ? ta.company_size
        .split(",")
        .map((s) => s.trim())
        .map((part) => {
          if (part.includes("-")) return part.replace("-", ",");
          if (part.endsWith("+")) return part.replace("+", ",").replace(/\d+/, (m) => m + ",") || "501,";
          return part;
        })
        .filter(Boolean)
    : undefined;
  return {
    geo: countries?.length ? ({ countries } as IcpGeo) : undefined,
    positions:
      ta.positions?.length ? ({ titles_strict: ta.positions } as IcpPositions) : undefined,
    industries: industries?.length ? industries : undefined,
    company_size:
      employeeRanges?.length ? ({ employee_ranges: employeeRanges } as IcpCompanySize) : undefined,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const product = body.product;
    const segmentsRaw = body.segments;
    const target_audience = body.target_audience as TargetAudienceBody | undefined;

    if (!product || !Array.isArray(segmentsRaw) || segmentsRaw.length === 0) {
      return NextResponse.json(
        { success: false, error: "product and segments (non-empty) required" },
        { status: 400 }
      );
    }

    const segments = segmentsRaw.map((s: { name?: string; personalization?: string; personalization_ideas?: string }) => ({
      name: s.name || "Segment",
      personalization: s.personalization ?? s.personalization_ideas ?? "",
      leads: [] as string[],
    }));

    const payload: DemoImportPayload = {
      product: {
        name: typeof product.name === "string" ? product.name : "Product",
        description: typeof product.description === "string" ? product.description : "",
        goal_type: typeof product.goal_type === "string" ? product.goal_type : "MANUAL_GOAL",
        goal_description: typeof product.goal_description === "string" ? product.goal_description : "",
      },
      segments,
    };

    const { valid, error: validationError } = validateDemoImportPayload(payload);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: validationError || "Invalid payload" },
        { status: 400 }
      );
    }

    let objectKey: string;
    try {
      const result = await uploadDemoImportToS3(payload);
      objectKey = result.objectKey;
    } catch (uploadErr: unknown) {
      const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      if (msg.includes("not configured") || msg.includes("S3 client")) {
        return NextResponse.json(
          {
            success: false,
            error: "MinIO is not configured on server. Set MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY in Vercel env.",
          },
          { status: 503 }
        );
      }
      throw uploadErr;
    }

    const icp = target_audience ? targetAudienceToIcp(target_audience) : {};
    const job_id = generateJobId();
    const minio_payload = {
      product: payload.product,
      segments: payload.segments,
    };
    const input: LeadgenJobInput = {
      job_id,
      icp,
      limits: { target_leads: 50, max_runtime_ms: 45000 },
      minio_payload,
      minio_key_to_update: objectKey,
    };
    createJob(job_id, input);

    const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
    const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const origin =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL ?? (host ? `${proto}://${host}` : "http://localhost:3000");

    fetch(`${origin}/api/leadgen/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id }),
    }).catch((err) => console.error("Launch outreach: leadgen run trigger error:", err));

    const res = NextResponse.json({ success: true, key: objectKey });
    res.cookies.set("demo_st_minio_id", objectKey, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      domain: ".salestrigger.io",
    });
    return res;
  } catch (err: unknown) {
    console.error("Launch outreach error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
