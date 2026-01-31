/**
 * GET /api/test-minio — только проверка подключения к MinIO (без записи файлов).
 * В MinIO пишут только: POST /api/demo-import и leadgen worker (реальные LinkedIn URL).
 */

import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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
        error: "MinIO env not set",
        hint: "Задайте MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в .env.local",
      },
      { status: 500 }
    );
  }

  try {
    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    return NextResponse.json({
      success: true,
      message: "MinIO: подключение ок (файлы не создаём)",
      bucket,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        error: message,
        hint: "Проверьте адрес (порт 9000 для API), логин и пароль MinIO",
      },
      { status: 500 }
    );
  }
}
