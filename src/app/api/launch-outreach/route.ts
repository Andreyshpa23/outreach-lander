/**
 * POST /api/launch-outreach
 * Сначала собираем лиды (воркер Apollo), потом один раз создаём файл в MinIO с лидами и возвращаем ответ.
 * Клиент ждёт ответа (Preparing…) — файл создаётся только после сбора лидов.
 */

import { NextResponse } from "next/server";
import {
  DemoImportPayload,
  generateDemoImportKey,
  validateDemoImportPayload,
} from "@/lib/demo-import-storage";
import { getMinioClient } from "@/lib/minio-config";
import { createJob, generateJobId, getJob } from "@/lib/leadgen/job-store";
import type { LeadgenJobInput, Icp, IcpGeo, IcpPositions, IcpCompanySize, SegmentIcp } from "@/lib/leadgen/types";
import { runLeadgenWorker } from "@/lib/leadgen/leadgen-worker";

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
  // Parse company_size: "1-10, 11-50, 51-200" -> ["1-10", "11-50", "51-200"]
  // Keep hyphen format (Apollo format), don't convert to comma
  const employeeRanges = ta.company_size
    ? ta.company_size
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        // Keep as-is if already in Apollo format (with hyphen)
        // Convert "500+" to "501+" or similar if needed
        .map((part) => {
          if (part.includes("-")) return part; // Already in Apollo format
          if (part.endsWith("+")) return part; // Keep "500+" as-is, Apollo handles it
          // If no hyphen and no plus, assume it's a single number - convert to range
          // But better to keep as-is and let toApolloEmployeeRanges handle it
          return part;
        })
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

/**
 * Парсим linkedin_filters в формате Apollo (из промпта generate):
 * "Titles: CEO, Founder, VP Sales. Keywords: SaaS, B2B, technology."
 * → positions.titles_strict, industry_keywords для корректного запроса к Apollo API.
 */
function linkedinFiltersToIcpAddition(linkedinFilters: string | undefined): Partial<Icp> {
  if (!linkedinFilters || typeof linkedinFilters !== "string") return {};
  const raw = linkedinFilters.trim();
  if (!raw.length) return {};

  let titles: string[] = [];
  let keywords: string[] = [];

  const titlesMatch = raw.match(/\bTitles?\s*:\s*([^.]+?)(?=\s*\.?\s*Keywords?\s*:|$)/i);
  const keywordsMatch = raw.match(/\bKeywords?\s*:\s*(.+)$/i);

  if (titlesMatch) {
    titles = titlesMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  if (keywordsMatch) {
    keywords = keywordsMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/\.+$/, ""))
      .filter(Boolean)
      .slice(0, 10);
  }

  if (titles.length > 0 || keywords.length > 0) {
    return {
      positions: titles.length > 0 ? ({ titles_strict: titles } as IcpPositions) : undefined,
      industry_keywords: keywords.length > 0 ? keywords : (titles.length > 0 ? titles : undefined),
    };
  }

  // Fallback: одна строка без меток — разбиваем по запятым/точке с запятой, первые = титулы, все = ключевые слова
  const tokens = raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tokens.length) return {};
  const fallbackTitles = tokens.slice(0, 5);
  return {
    positions: { titles_strict: fallbackTitles } as IcpPositions,
    industry_keywords: tokens,
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

    if (!getMinioClient()) {
      return NextResponse.json(
        {
          success: false,
          error: "MinIO is not configured on server. Set MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY in Vercel env.",
        },
        { status: 503 }
      );
    }
    const objectKey = generateDemoImportKey();

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
      limits: { target_leads: 20, max_runtime_ms: 8000 },
      minio_payload,
      minio_key_to_update: objectKey,
    };
    createJob(job_id, input);

    await runLeadgenWorker(job_id, input);

    const job = getJob(job_id);
    const res = NextResponse.json({
      success: true,
      key: objectKey,
      job_id,
      download_csv_url: job?.download_csv_url ?? null,
      leads_count: job?.leads_count ?? 0,
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
