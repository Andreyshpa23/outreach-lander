/**
 * GET /api/test-minio — тест записи в MinIO: загружает тестовый JSON и возвращает результат.
 * Проверяет, что MINIO_* настроены и бакет доступен.
 */

import { NextResponse } from "next/server";
import { uploadDemoImportToS3 } from "@/lib/demo-import-storage";

export const runtime = "nodejs";

const TEST_PAYLOAD = {
  product: {
    name: "Test Product (minio check)",
    description: "Test upload to verify MinIO connection",
    goal_type: "MANUAL_GOAL",
    goal_description: "Test",
  },
  segments: [
    {
      name: "Test Segment",
      personalization: "Test",
      leads: [],
    },
  ],
};

export async function GET() {
  try {
    const result = await uploadDemoImportToS3(TEST_PAYLOAD);
    return NextResponse.json({
      success: true,
      message: "MinIO: файл успешно сохранён",
      objectKey: result.objectKey,
      path: `demo-imports/${result.objectKey}`,
      bucket: process.env.MINIO_BUCKET ?? "(не задан)",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const hasEnv =
      process.env.MINIO_ENDPOINT &&
      process.env.MINIO_BUCKET &&
      process.env.MINIO_ACCESS_KEY &&
      process.env.MINIO_SECRET_KEY;
    return NextResponse.json(
      {
        success: false,
        error: message,
        env_configured: !!hasEnv,
        hint: !hasEnv
          ? "Задайте MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в .env.local"
          : "Проверьте адрес (порт 9000 для API), логин и пароль MinIO",
      },
      { status: 500 }
    );
  }
}
