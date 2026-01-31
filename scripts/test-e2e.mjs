#!/usr/bin/env node
/**
 * E2E тест: сохранение в MinIO (demo-import + cookie) и сбор лидов через Apollo (leadgen).
 * Запуск: node scripts/test-e2e.mjs
 * Сервер должен быть запущен (npm run dev). По умолчанию BASE_URL=http://localhost:3002
 */

const BASE = process.env.BASE_URL || "http://localhost:3002";

async function main() {
  console.log("=== E2E тест (клиент) ===\n");
  console.log("BASE_URL:", BASE);

  // --- 1. Demo-import: сохранение в MinIO + cookie demo_st_minio_id ---
  console.log("\n--- 1. POST /api/demo-import (MinIO + cookie) ---");
  const demoPayload = {
    product: {
      name: "E2E Test Product",
      description: "Test save to MinIO and cookie",
      goal_type: "MANUAL_GOAL",
      goal_description: "Test",
    },
    segments: [
      {
        name: "Test Segment",
        personalization: "Test personalization",
        leads: [
          "https://linkedin.com/in/jane-smith-1",
          "https://linkedin.com/in/jane-smith-2",
        ],
      },
    ],
  };
  try {
    const demoRes = await fetch(`${BASE}/api/demo-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demoPayload),
    });
    const demoJson = await demoRes.json();
    const setCookie = demoRes.headers.get("set-cookie") || "";
    const hasDemoCookie = setCookie.includes("demo_st_minio_id");
    console.log("Status:", demoRes.status);
    console.log("Response:", JSON.stringify(demoJson, null, 2));
    console.log("Cookie demo_st_minio_id задана:", hasDemoCookie);
    if (!demoRes.ok || !demoJson.success) {
      console.log("❌ Demo-import: ошибка");
      return;
    }
    console.log("✅ Demo-import: сохранено в MinIO, cookie demo_st_minio_id установлена");
  } catch (e) {
    console.error("❌ Demo-import request failed:", e.message);
  }

  // --- 2. Test MinIO (проверка записи) ---
  console.log("\n--- 2. GET /api/test-minio ---");
  try {
    const minioRes = await fetch(`${BASE}/api/test-minio`);
    const minioJson = await minioRes.json();
    console.log("Response:", JSON.stringify(minioJson, null, 2));
    if (minioJson.success) {
      console.log("✅ MinIO: запись работает, objectKey:", minioJson.objectKey);
    } else {
      console.log("❌ MinIO: ошибка", minioJson.error);
    }
  } catch (e) {
    console.error("❌ Test-minio request failed:", e.message);
  }

  // --- 3. Leadgen: Apollo лиды ---
  console.log("\n--- 3. POST /api/leadgen (Apollo) ---");
  const leadgenPayload = {
    icp: {
      geo: { countries: ["United States"] },
      positions: { titles_strict: ["CEO", "Founder"] },
      industries: ["Technology"],
      company_size: { employee_ranges: ["1,10", "11,50"] },
    },
    limits: { target_leads: 5, max_runtime_ms: 25000 },
  };
  let jobId;
  try {
    const createRes = await fetch(`${BASE}/api/leadgen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadgenPayload),
    });
    const createJson = await createRes.json();
    console.log("Create response:", JSON.stringify(createJson, null, 2));
    if (!createRes.ok || !createJson.job_id) {
      console.log("❌ Leadgen create: ошибка");
      return;
    }
    jobId = createJson.job_id;
    console.log("Job ID:", jobId);
  } catch (e) {
    console.error("❌ Leadgen create failed:", e.message);
    return;
  }

  // --- 3b. Запуск воркера вручную (на случай если fire-and-forget не долетел) ---
  console.log("\n--- 3b. POST /api/leadgen/run (запуск воркера) ---");
  try {
    const runRes = await fetch(`${BASE}/api/leadgen/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId }),
    });
    const runJson = await runRes.json().catch(() => ({}));
    console.log("Run status:", runRes.status, runJson);
  } catch (e) {
    console.error("Run request error:", e.message);
  }

  // --- 4. Poll GET /api/leadgen/{job_id} ---
  console.log("\n--- 4. Poll GET /api/leadgen/" + jobId + " (до 45 сек) ---");
  const pollStart = Date.now();
  const pollMax = 45000;
  let result;
  while (Date.now() - pollStart < pollMax) {
    const getRes = await fetch(`${BASE}/api/leadgen/${jobId}`);
    result = await getRes.json();
    console.log("Status:", result.status, "| leads_count:", result.leads_count ?? 0);
    if (result.status === "done" || result.status === "failed") break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!result) {
    console.log("❌ Leadgen: таймаут опроса");
    return;
  }
  console.log("\nИтог leadgen:", JSON.stringify({
    status: result.status,
    leads_count: result.leads_count,
    download_csv_url: result.download_csv_url ? "(есть)" : null,
    error: result.error,
    debug: result.debug,
  }, null, 2));
  if (result.leads_preview && result.leads_preview.length > 0) {
    console.log("\nПервые лиды (preview):");
    result.leads_preview.slice(0, 3).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.full_name} | ${l.title} | ${l.company_name}`);
    });
  }
  if (result.status === "done" && result.leads_count > 0) {
    console.log("\n✅ Apollo отдал лидов:", result.leads_count);
  } else if (result.status === "failed") {
    console.log("\n❌ Leadgen failed:", result.error);
  } else {
    console.log("\n⚠ Leadgen завершился со статусом", result.status, "или 0 лидов");
  }

  console.log("\n=== Конец E2E теста ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
