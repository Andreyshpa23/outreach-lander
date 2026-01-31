#!/usr/bin/env node
/**
 * Пушит переменные из .env.local в Vercel (Environment Variables) через API.
 * Нужно один раз задать в .env.local:
 *   VERCEL_TOKEN=...   (создать: vercel.com/account/tokens)
 *   VERCEL_PROJECT_NAME=outreach-lander   (или id проекта)
 * Остальные ключи (MINIO_*, APOLLO_*, AZURE_*, DAILY_*) возьмёт из .env.local и отправит в Vercel.
 *
 * Запуск: node scripts/push-vercel-env.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ENV_FILE = join(process.cwd(), ".env.local");
const VERCEL_API = "https://api.vercel.com/v10/projects";

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8");
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    out[m[1]] = val;
  }
  return out;
}

const KEYS_TO_PUSH = [
  "MINIO_ENDPOINT",
  "MINIO_BUCKET",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "APOLLO_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
  "DAILY_REQUEST_LIMIT",
  "AUTH_EMAIL",
  "AUTH_PASSWORD",
];

async function main() {
  const env = loadEnv(ENV_FILE);
  const token = env.VERCEL_TOKEN || process.env.VERCEL_TOKEN;
  const projectName = env.VERCEL_PROJECT_NAME || process.env.VERCEL_PROJECT_NAME || "outreach-lander";

  if (!token) {
    console.error("Нет VERCEL_TOKEN. Добавь в .env.local:");
    console.error("  VERCEL_TOKEN=... (создать: https://vercel.com/account/tokens)");
    process.exit(1);
  }

  const toPush = KEYS_TO_PUSH.filter((k) => env[k] != null && String(env[k]).trim() !== "");
  if (toPush.length === 0) {
    console.error("В .env.local нет ни одной из переменных:", KEYS_TO_PUSH.join(", "));
    process.exit(1);
  }

  console.log("Проект:", projectName);
  console.log("Отправляю в Vercel (Production):", toPush.join(", "));

  for (const key of toPush) {
    const value = env[key];
    const body = {
      key,
      value,
      type: key.includes("KEY") || key.includes("SECRET") || key === "AUTH_PASSWORD" ? "secret" : "plain",
      target: ["production"],
    };
    const res = await fetch(`${VERCEL_API}/${encodeURIComponent(projectName)}/env?upsert=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.key || data.created)) {
      console.log("  OK:", key);
    } else {
      console.error("  FAIL:", key, res.status, data.error || data);
    }
  }

  console.log("Готово. Сделай Redeploy в Vercel, чтобы применить переменные.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
