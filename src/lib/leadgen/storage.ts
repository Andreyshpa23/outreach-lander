/**
 * Leadgen storage: upload CSV to S3/MinIO and return presigned download URL.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ENDPOINT = process.env.MINIO_ENDPOINT;
const BUCKET = process.env.MINIO_BUCKET;
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const SECRET_KEY = process.env.MINIO_SECRET_KEY;
const PRESIGN_TTL_SEC = 60 * 15; // 15 min

const s3Client =
  ENDPOINT && BUCKET && ACCESS_KEY && SECRET_KEY
    ? new S3Client({
        region: "us-east-1",
        endpoint: ENDPOINT,
        forcePathStyle: true,
        credentials: {
          accessKeyId: ACCESS_KEY,
          secretAccessKey: SECRET_KEY,
        },
      })
    : null;

export function isStorageConfigured(): boolean {
  return !!s3Client;
}

const LEADGEN_PREFIX = "leadgen-csv/";

export async function uploadCsv(
  objectKey: string,
  csvBody: string
): Promise<void> {
  if (!s3Client || !BUCKET) {
    throw new Error("S3/MinIO is not configured for leadgen");
  }
  const key = LEADGEN_PREFIX + objectKey;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: csvBody,
      ContentType: "text/csv",
    })
  );
}

export async function getPresignedDownloadUrl(objectKey: string): Promise<string> {
  if (!s3Client || !BUCKET) {
    throw new Error("S3/MinIO is not configured for leadgen");
  }
  const key = LEADGEN_PREFIX + objectKey;
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(s3Client, command, { expiresIn: PRESIGN_TTL_SEC });
  return url;
}
