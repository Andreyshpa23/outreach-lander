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

    const { objectKey } = await uploadDemoImportToS3(payload);

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
  } catch (err: any) {
    console.error("Error in /api/demo-import:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process demo import request",
      },
      { status: 500 }
    );
  }
}

