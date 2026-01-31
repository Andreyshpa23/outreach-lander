#!/usr/bin/env node
/**
 * Тест: Apollo по фильтрам → 100 лидов → сохранение в MinIO + замер времени.
 * Запуск: node scripts/test-apollo-100-leads.mjs
 * Сервер должен быть запущен (npm run dev). BASE_URL по умолчанию http://localhost:3000
 *
 * После выполнения открой MinIO → бакет demo-salestrigger → demo-imports/ → файл {minio_object_key}.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

const PAYLOAD = {
  icp: {
    geo: { countries: ["United States"] },
    positions: { titles_strict: ["CEO", "VP Sales", "Founder", "Head of Sales", "VP Marketing"] },
    industries: ["Technology", "Computer Software", "SaaS"],
    company_size: { employee_ranges: ["1,10", "11,50", "51,200"] },
  },
  limits: { target_leads: 100, max_runtime_ms: 55000 },
  minio_payload: {
    product: {
      name: "Test Apollo 100 leads",
      description: "Speed test: 100 leads by filters → MinIO",
      goal_type: "MANUAL_GOAL",
      goal_description: "Test",
    },
    segments: [{ name: "Test segment", personalization: "" }],
  },
};

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_MS = 90000;

async function main() {
  console.log("=== Тест: Apollo 100 лидов → MinIO + замер скорости ===\n");
  console.log("BASE_URL:", BASE);
  console.log("Фильтры:", JSON.stringify(PAYLOAD.icp, null, 2));
  console.log("target_leads: 100, max_runtime_ms: 55000\n");

  const startMs = Date.now();

  // 1. Create job
  console.log("--- 1. POST /api/leadgen ---");
  let jobId;
  try {
    const createRes = await fetch(`${BASE}/api/leadgen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PAYLOAD),
    });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.job_id) {
      console.error("❌ Create failed:", createJson);
      process.exit(1);
    }
    jobId = createJson.job_id;
    console.log("Job ID:", jobId);
  } catch (e) {
    console.error("❌ Request failed:", e.message);
    process.exit(1);
  }

  // 2. Trigger worker
  console.log("\n--- 2. POST /api/leadgen/run ---");
  await fetch(`${BASE}/api/leadgen/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId }),
  }).catch(() => {});

  // 3. Poll until done
  console.log("\n--- 3. Ожидание завершения (poll каждые 2.5 сек, макс 90 сек) ---");
  const pollStart = Date.now();
  let result;
  while (Date.now() - pollStart < POLL_MAX_MS) {
    const getRes = await fetch(`${BASE}/api/leadgen/${jobId}`);
    result = await getRes.json();
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`  [${elapsed}s] status=${result.status} leads_count=${result.leads_count ?? 0}`);
    if (result.status === "done" || result.status === "failed") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const totalSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log("\n--- Результат ---");
  if (!result) {
    console.log("❌ Таймаут опроса");
    process.exit(1);
  }
  if (result.status === "failed") {
    console.log("❌ Job failed:", result.error);
    process.exit(1);
  }

  console.log("✅ Статус: done");
  console.log("✅ Лидов:", result.leads_count ?? 0);
  console.log("✅ Время от старта до завершения:", totalSec, "сек");
  if (result.minio_object_key) {
    console.log("✅ MinIO: demo-imports/" + result.minio_object_key);
    console.log("\nОткрой MinIO → бакет demo-salestrigger → папка demo-imports/ → файл", result.minio_object_key);
  } else {
    console.log("⚠ В MinIO файл не сохранён (minio_object_key пустой — при 0 лидов файл не создаётся)");
    if ((result.leads_count ?? 0) === 0) {
      console.log("   Проверь APOLLO_API_KEY в .env.local и что фильтры возвращают лиды.");
    }
  }
  if (result.download_csv_url) {
    console.log("CSV (presigned):", result.download_csv_url.slice(0, 60) + "...");
  }
  console.log("\n=== Конец теста ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
