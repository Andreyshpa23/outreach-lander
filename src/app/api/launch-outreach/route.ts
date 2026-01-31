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
import type { LeadgenJobInput, Icp, IcpGeo, IcpPositions, IcpCompanySize, SegmentIcp } from "@/lib/leadgen/types";

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

/** Из строки фильтров (linkedin_filters от промпта) — титулы и ключевые слова для сегмента. */
function linkedinFiltersToIcpAddition(linkedinFilters: string | undefined): Partial<Icp> {
  if (!linkedinFilters || typeof linkedinFilters !== "string") return {};
  const tokens = linkedinFilters
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tokens.length) return {};
  const titles = tokens.slice(0, 5);
  const keywords = tokens.length > 1 ? tokens : tokens;
  return {
    positions: { titles_strict: titles } as IcpPositions,
    industry_keywords: keywords,
  };
}

function mergeIcp(base: Icp, addition: Partial<Icp>): Icp {
  return {
    ...base,
    ...addition,
    positions: addition.positions ?? base.positions,
    industry_keywords: [...(base.industry_keywords ?? []), ...(addition.industry_keywords ?? [])].filter(Boolean),
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

    const segments = segmentsRaw.map((s: { name?: string; personalization?: string; personalization_ideas?: string; linkedin_filters?: string }) => ({
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

    const baseIcp = target_audience ? targetAudienceToIcp(target_audience) : {};

    /** Check if ICP has any meaningful content (non-empty arrays/strings) */
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

    const segment_icps: SegmentIcp[] = [];
    // Always create per-segment ICPs so each segment gets its own search
    segmentsRaw.forEach((s: { linkedin_filters?: string; name?: string }, i: number) => {
      const addition = linkedinFiltersToIcpAddition(s.linkedin_filters);
      let segmentIcp = mergeIcp(baseIcp, addition);
      // If ICP is effectively empty, add fallback keyword
      if (isIcpEmpty(segmentIcp)) {
        const fallbackKeyword = s.name || payload.product.name || "Technology";
        segmentIcp = { ...segmentIcp, industry_keywords: [fallbackKeyword] };
        console.log("[launch-outreach] segment", i, "empty ICP, added fallback:", fallbackKeyword);
      }
      segment_icps.push({ segment_index: i, icp: segmentIcp });
      console.log("[launch-outreach] segment", i, s.name, "icp:", JSON.stringify(segmentIcp).slice(0, 200), "filters:", s.linkedin_filters?.slice(0, 50) || "(none)");
    });
    console.log("[launch-outreach] segment_icps count:", segment_icps.length, "baseIcp_empty:", isIcpEmpty(baseIcp));
    const job_id = generateJobId();
    const minio_payload = {
      product: payload.product,
      segments: payload.segments,
    };
    const input: LeadgenJobInput = {
      job_id,
      icp: baseIcp,
      ...(segment_icps.length > 0 && { segment_icps }),
      limits: { target_leads: 50, max_runtime_ms: 55000 },
      minio_payload,
      minio_key_to_update: objectKey,
    };
    createJob(job_id, input);

    // Не вызываем /api/leadgen/run отсюда: на Vercel функция завершается после return,
    // и фоновый fetch часто не успевает выполниться. Запуск делается с клиента (см. page.tsx).
    const res = NextResponse.json({
      success: true,
      key: objectKey,
      job_id,
      input,
    });
    res.cookies.set("demo_st_minio_id", objectKey, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      domain: ".salestrigger.io",
    });
    return res;
  } catch (err: unknown) {
    console.error("Launch outreach error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
