import { NextResponse } from "next/server";
import { getDemoImportFromS3 } from "@/lib/demo-import-storage";

export const runtime = "nodejs";

/**
 * GET /api/demo-import/verify?key=uuid.json
 * Возвращает JSON из MinIO по ключу (для проверки, что leadgen записал результаты Apollo).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key")?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "Missing query param: key (e.g. uuid.json)" },
      { status: 400 }
    );
  }
  try {
    const payload = await getDemoImportFromS3(key);
    if (!payload) {
      return NextResponse.json(
        { error: "Object not found or MinIO not configured", key },
        { status: 404 }
      );
    }
    return NextResponse.json({ key, payload });
  } catch (e) {
    console.error("demo-import/verify error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read from MinIO" },
      { status: 500 }
    );
  }
}
