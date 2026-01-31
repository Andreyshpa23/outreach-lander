import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getMinioClient, getDemoImportPrefix } from "@/lib/minio-config";

/**
 * Итоговый формат JSON в MinIO (demo-imports или корень по MINIO_DEMO_PREFIX):
 * - product: name, description, goal_type (MANUAL_GOAL), goal_description
 * - segments: name, personalization, leads (массив LinkedIn URL), outreach_personalization, dialog_personalization.
 *   Только ссылки на лидов (leads), без leads_detail.
 */
export interface DemoImportSegment {
  name: string;
  personalization: string;
  /** Ссылки на LinkedIn (массив URL) */
  leads: string[];
  outreach_personalization?: string;
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

/** Генерирует новый objectKey для demo-import (без записи в MinIO). */
export function generateDemoImportKey(): string {
  const prefix = getDemoImportPrefix();
  const uuid =
    (typeof crypto !== "undefined" && "randomUUID" in crypto && (crypto as any).randomUUID()) ||
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  const fileKey = `${uuid}.json`;
  return prefix ? `${prefix}/${fileKey}` : fileKey;
}

/**
 * Upload payload to MinIO. If existingKey is set, overwrite that object (для дополнения файла лидами).
 */
export async function uploadDemoImportToS3(
  payload: DemoImportPayload,
  existingKey?: string
): Promise<{ objectKey: string }> {
  const minio = getMinioClient();
  if (!minio) {
    throw new Error(
      "MinIO не настроен. Задай MINIO_ENDPOINT (порт 9000), MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY в Vercel → Settings → Environment Variables (локально: .env.local)"
    );
  }

  const prefix = getDemoImportPrefix();
  let objectKey: string;
  if (existingKey && existingKey.trim()) {
    objectKey = existingKey.includes("/") ? existingKey.trim() : (prefix ? `${prefix}/${existingKey.trim()}` : existingKey.trim());
  } else {
    const uuid =
      (typeof crypto !== "undefined" && "randomUUID" in crypto && (crypto as any).randomUUID()) ||
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    const fileKey = `${uuid}.json`;
    objectKey = prefix ? `${prefix}/${fileKey}` : fileKey;
  }

  const body = JSON.stringify(payload);

  const command = new PutObjectCommand({
    Bucket: minio.bucket,
    Key: objectKey,
    Body: body,
    ContentType: "application/json",
  });

  await minio.client.send(command);

  return { objectKey };
}

/**
 * Read demo-import JSON from MinIO by key (полный ключ в бакете: "uuid.json" или "prefix/uuid.json").
 */
export async function getDemoImportFromS3(
  fileKey: string
): Promise<DemoImportPayload | null> {
  const minio = getMinioClient();
  if (!minio || !fileKey || !fileKey.trim()) return null;
  const prefix = getDemoImportPrefix();
  const key = fileKey.includes("/") ? fileKey : prefix ? `${prefix}/${fileKey}` : fileKey;
  try {
    const command = new GetObjectCommand({ Bucket: minio.bucket, Key: key });
    const res = await minio.client.send(command);
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as DemoImportPayload;
  } catch {
    return null;
  }
}

