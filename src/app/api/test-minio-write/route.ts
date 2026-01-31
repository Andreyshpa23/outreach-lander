/**
 * GET /api/test-minio-write — проверка записи в MinIO (тот же клиент, что demo-import и leadgen).
 * Создаёт файл demo-imports/test-write-{timestamp}.json.
 * Возвращает точный текст ошибки при неудаче (подключение, бакет, права).
 */

import { NextResponse } from "next/server";
import { PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getMinioConfig, createMinioClient, getDemoImportPrefix } from "@/lib/minio-config";

export const runtime = "nodejs";

export async function GET() {
  const config = getMinioConfig();
  if (!config) {
    return NextResponse.json(
      {
        success: false,
        error: "MinIO не настроен на сервере",
        hint: "Задай MINIO_ENDPOINT (порт 9000, без слеша), MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в Vercel → Settings → Environment Variables (локально: .env.local).",
        expected_format: "MINIO_ENDPOINT=http://host:9000",
      },
      { status: 503 }
    );
  }

  try {
    const client = createMinioClient(config);
    // Проверяем, что бакет доступен
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        error: message,
        step: "HeadBucket",
        hint: "Проверь: 1) MINIO_ENDPOINT — порт 9000 (API), не 9001 (UI). 2) Бакет создан в MinIO Console. 3) ACCESS_KEY/SECRET_KEY от MinIO (Identity → Access Keys).",
        endpoint_used: config.endpoint,
        bucket: config.bucket,
      },
      { status: 500 }
    );
  }

  try {
    const client = createMinioClient(config);
    const prefix = getDemoImportPrefix();
    const fileName = `test-write-${Date.now()}.json`;
    const key = prefix ? `${prefix}/${fileName}` : fileName;
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: JSON.stringify({ test: true, at: new Date().toISOString() }),
        ContentType: "application/json",
      })
    );
    return NextResponse.json({
      success: true,
      message: "Запись в MinIO прошла. Подключение и бакет корректны.",
      bucket: config.bucket,
      key,
      hint: prefix ? `Открой MinIO (порт 9001 UI) → бакет ${config.bucket} → ${prefix}/ → ${fileName}` : `Открой MinIO → бакет ${config.bucket} → корень → ${fileName}`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        error: message,
        step: "PutObject",
        hint: "Бакет есть, но запись не прошла. Проверь права Access Key (должен иметь PutObject на бакет).",
        endpoint_used: config.endpoint,
        bucket: config.bucket,
      },
      { status: 500 }
    );
  }
}
