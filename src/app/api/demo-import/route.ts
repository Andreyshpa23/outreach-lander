import { NextResponse } from "next/server";
import {
  DemoImportPayload,
  uploadDemoImportToS3,
  validateDemoImportPayload,
} from "@/lib/demo-import-storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const json = await req.json();

    const { valid, error } = validateDemoImportPayload(json);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: error || "Invalid payload" },
        { status: 400 }
      );
    }

    const payload = json as DemoImportPayload;

    let objectKey: string;
    try {
      const result = await uploadDemoImportToS3(payload);
      objectKey = result.objectKey;
    } catch (uploadErr: unknown) {
      const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      if (msg.includes("not configured") || msg.includes("S3 client")) {
        return NextResponse.json(
          { success: false, error: "MinIO is not configured on server. Set MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY in Vercel env." },
          { status: 503 }
        );
      }
      throw uploadErr;
    }

    // objectKey is {uuid}.json, cookie stores only this id
    const cookieValue = objectKey;

    const res = NextResponse.json({
      success: true,
      key: cookieValue,
    });

    // Cookie demo_st_minio_id — только id записи в MinIO (object key)
    res.cookies.set("demo_st_minio_id", cookieValue, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
      domain: ".salestrigger.io",
    });

    return res;
  } catch (err: unknown) {
    console.error("Error in /api/demo-import:", err);
    const message = err instanceof Error ? err.message : "Failed to process demo import request";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

