/**
 * GET /api/test-minio-write — проверка записи в MinIO (логика + учётные данные).
 * Создаёт файл demo-imports/test-write-{timestamp}.json с телом {"test": true}.
 * Если MINIO_* не заданы или неверный логин/пароль — вернёт ошибку.
 */

import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

export async function GET() {
  const endpoint = process.env.MINIO_ENDPOINT;
  const bucket = process.env.MINIO_BUCKET;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    return NextResponse.json(
      {
        success: false,
        error: "MinIO не настроен на сервере",
        hint: "Задайте MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в Vercel → Settings → Environment Variables",
      },
      { status: 503 }
    );
  }

  try {
    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
    const key = `demo-imports/test-write-${Date.now()}.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify({ test: true, at: new Date().toISOString() }),
        ContentType: "application/json",
      })
    );
    return NextResponse.json({
      success: true,
      message: "Запись в MinIO прошла. Логика и учётные данные работают.",
      bucket,
      key,
      hint: `Открой MinIO → бакет ${bucket} → папка demo-imports/ → файл ${key.split("/")[1]}`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        error: message,
        hint: "Проверь MINIO_ENDPOINT (порт 9000), MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в Vercel. Сеть Vercel должна достучаться до MinIO.",
      },
      { status: 500 }
    );
  }
}
