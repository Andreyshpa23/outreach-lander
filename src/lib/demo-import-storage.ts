import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ENDPOINT = process.env.MINIO_ENDPOINT;
const BUCKET = process.env.MINIO_BUCKET;
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const SECRET_KEY = process.env.MINIO_SECRET_KEY;

if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
  console.warn(
    "MINIO / S3 demo import configuration is not fully set. " +
      "Set MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY env vars."
  );
}

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

/**
 * Формат JSON в MinIO (demo-imports/{uuid}.json):
 * - product: name, description, goal_type (MANUAL_GOAL), goal_description
 * - segments: name, personalization, leads (массив ссылок LinkedIn), опционально outreach_personalization, dialog_personalization
 */
export interface DemoImportSegment {
  name: string;
  personalization: string;
  /** Ссылки на LinkedIn, например https://linkedin.com/in/jane-smith-1 */
  leads: string[];
  /** Если задано — промпт для outreach берётся целиком отсюда */
  outreach_personalization?: string;
  /** Если задано — промпт для диалога берётся целиком отсюда */
  dialog_personalization?: string;
}

export interface DemoImportProduct {
  name: string;
  description: string;
  goal_type: "MANUAL_GOAL" | string;
  goal_description: string;
}

export interface DemoImportPayload {
  product: DemoImportProduct;
  segments: DemoImportSegment[];
}

export function validateDemoImportPayload(
  payload: any
): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Payload must be an object" };
  }

  const { product, segments } = payload;

  if (!product || typeof product !== "object") {
    return { valid: false, error: "Missing or invalid product" };
  }

  if (typeof product.name !== "string" || !product.name.trim()) {
    return { valid: false, error: "product.name must be a non-empty string" };
  }
  if (
    typeof product.description !== "string" ||
    !product.description.trim()
  ) {
    return {
      valid: false,
      error: "product.description must be a non-empty string",
    };
  }
  if (typeof product.goal_type !== "string") {
    return { valid: false, error: "product.goal_type must be a string" };
  }
  if (
    typeof product.goal_description !== "string" ||
    !product.goal_description.trim()
  ) {
    return {
      valid: false,
      error: "product.goal_description must be a non-empty string",
    };
  }

  if (!Array.isArray(segments) || segments.length === 0) {
    return { valid: false, error: "segments must be a non-empty array" };
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg || typeof seg !== "object") {
      return { valid: false, error: `Segment at index ${i} is invalid` };
    }
    if (typeof seg.name !== "string" || !seg.name.trim()) {
      return {
        valid: false,
        error: `segments[${i}].name must be a non-empty string`,
      };
    }
    if (
      typeof seg.personalization !== "string" ||
      !seg.personalization.trim()
    ) {
      return {
        valid: false,
        error: `segments[${i}].personalization must be a non-empty string`,
      };
    }
    if (!Array.isArray(seg.leads)) {
      return {
        valid: false,
        error: `segments[${i}].leads must be an array of strings`,
      };
    }
    for (let j = 0; j < seg.leads.length; j++) {
      if (typeof seg.leads[j] !== "string" || !seg.leads[j].trim()) {
        return {
          valid: false,
          error: `segments[${i}].leads[${j}] must be a non-empty string`,
        };
      }
    }
  }

  return { valid: true };
}

export async function uploadDemoImportToS3(
  payload: DemoImportPayload
): Promise<{ objectKey: string }> {
  if (!s3Client) {
    throw new Error("S3 client is not configured");
  }

  const uuid =
    (typeof crypto !== "undefined" &&
      "randomUUID" in crypto &&
      (crypto as any).randomUUID()) ||
    Math.random().toString(36).slice(2) + Date.now().toString(36);

  const fileKey = `${uuid}.json`;
  const objectKey = `demo-imports/${fileKey}`;

  const body = JSON.stringify(payload);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
    Body: body,
    ContentType: "application/json",
  });

  await s3Client.send(command);

  return { objectKey: fileKey };
}

