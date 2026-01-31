/**
 * Leadgen storage: upload CSV to S3/MinIO and return presigned download URL.
 */

import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getMinioClient, getLeadgenCsvPrefix } from "@/lib/minio-config";

const PRESIGN_TTL_SEC = 60 * 15; // 15 min

export function isStorageConfigured(): boolean {
  return getMinioClient() !== null;
}

export async function uploadCsv(
  objectKey: string,
  csvBody: string
): Promise<void> {
  const minio = getMinioClient();
  if (!minio) {
    throw new Error("MinIO не настроен. Задай MINIO_ENDPOINT (порт 9000), MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в .env.local");
  }
  const prefix = getLeadgenCsvPrefix();
  const key = prefix ? `${prefix}/${objectKey}` : objectKey;
  await minio.client.send(
    new PutObjectCommand({
      Bucket: minio.bucket,
      Key: key,
      Body: csvBody,
      ContentType: "text/csv",
    })
  );
}

export async function getPresignedDownloadUrl(objectKey: string): Promise<string> {
  const minio = getMinioClient();
  if (!minio) {
    throw new Error("MinIO не настроен. Задай MINIO_ENDPOINT (порт 9000), MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в .env.local");
  }
  const prefix = getLeadgenCsvPrefix();
  const key = prefix ? `${prefix}/${objectKey}` : objectKey;
  const command = new GetObjectCommand({ Bucket: minio.bucket, Key: key });
  const url = await getSignedUrl(minio.client, command, { expiresIn: PRESIGN_TTL_SEC });
  return url;
}
