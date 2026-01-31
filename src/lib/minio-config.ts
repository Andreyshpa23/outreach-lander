/**
 * Общая конфигурация MinIO/S3 для demo-import и leadgen.
 * Endpoint: порт 9000 (API), не 9001 (UI). Без завершающего слеша.
 */

import { S3Client } from "@aws-sdk/client-s3";

function normalizeEndpoint(url: string | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Убираем завершающий слеш — иначе SDK может формировать неверный URL
  const withoutSlash = trimmed.replace(/\/+$/, "");
  if (!withoutSlash) return null;
  try {
    new URL(withoutSlash);
    return withoutSlash;
  } catch {
    return null;
  }
}

export function getMinioConfig(): {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
} | null {
  const endpoint = normalizeEndpoint(process.env.MINIO_ENDPOINT);
  const bucket = process.env.MINIO_BUCKET?.trim();
  const accessKey = process.env.MINIO_ACCESS_KEY?.trim();
  const secretKey = process.env.MINIO_SECRET_KEY?.trim();
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return { endpoint, bucket, accessKey, secretKey };
}

/**
 * S3-клиент для MinIO с корректными опциями:
 * - forcePathStyle: true (обязательно для MinIO)
 * - disableHostPrefix: true (избегает ошибок с кастомным endpoint)
 */
export function createMinioClient(config: {
  endpoint: string;
  accessKey: string;
  secretKey: string;
}): S3Client {
  return new S3Client({
    region: "us-east-1",
    endpoint: config.endpoint,
    forcePathStyle: true,
    disableHostPrefix: true,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });
}

/** Общий клиент и бакет (для demo-import и leadgen). Каждый вызов использует текущий env. */
export function getMinioClient(): { client: S3Client; bucket: string } | null {
  const config = getMinioConfig();
  if (!config) return null;
  return {
    client: createMinioClient(config),
    bucket: config.bucket,
  };
}

export function isMinioConfigured(): boolean {
  return getMinioConfig() !== null;
}

/** Префикс для JSON demo-import в бакете. По умолчанию "" — файлы в корне бакета. Если нужна папка — задай MINIO_DEMO_PREFIX (например demo-imports). */
export function getDemoImportPrefix(): string {
  const p = process.env.MINIO_DEMO_PREFIX?.trim();
  return p ?? "";
}

/** Префикс для CSV leadgen в бакете. По умолчанию "" — файлы в корне. MINIO_LEADGEN_CSV_PREFIX для папки (например leadgen-csv). */
export function getLeadgenCsvPrefix(): string {
  const p = process.env.MINIO_LEADGEN_CSV_PREFIX?.trim();
  return p ?? "";
}
