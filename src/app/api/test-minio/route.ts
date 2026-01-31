/**
 * GET /api/test-minio — проверка подключения к MinIO (тот же клиент, что demo-import и leadgen).
 */

import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getMinioConfig, createMinioClient } from "@/lib/minio-config";

export const runtime = "nodejs";

export async function GET() {
  const config = getMinioConfig();
  if (!config) {
    return NextResponse.json(
      {
        success: false,
        error: "MinIO env not set",
        hint: "Задай MINIO_ENDPOINT (порт 9000, без слеша), MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в Vercel → Settings → Environment Variables (локально: .env.local)",
      },
      { status: 503 }
    );
  }

  try {
    const client = createMinioClient(config);
    await client.send(new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 1 }));
    return NextResponse.json({
      success: true,
      message: "MinIO: подключение ок (тот же конфиг, что для записи demo-imports и leadgen)",
      bucket: config.bucket,
      endpoint: config.endpoint,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        error: message,
        hint: "Проверь MINIO_ENDPOINT (порт 9000 для API), MINIO_BUCKET, логин и пароль MinIO",
        endpoint_used: config.endpoint,
      },
      { status: 500 }
    );
  }
}
