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

    // objectKey is {uuid}.json, cookie must contain exactly this value
    const cookieValue = objectKey;

    const res = NextResponse.json({
      success: true,
      key: cookieValue,
    });

    // Set cookie DEMO_IMPORT_SDR with the S3 object key
    // Domain is set to .salestrigger.io so it can be reused across subdomains
    res.cookies.set("DEMO_IMPORT_SDR", cookieValue, {
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

