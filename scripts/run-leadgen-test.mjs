#!/usr/bin/env node
/**
 * Быстрый тест leadgen: 5 лидов → Apollo → MinIO.
 * Проверяет, что в MinIO попадают результаты от Apollo (LinkedIn URL в segments[].leads).
 *
 * Запуск: node scripts/run-leadgen-test.mjs
 * Сервер должен быть запущен: npm run dev
 * BASE_URL по умолчанию http://localhost:3000
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

const PAYLOAD = {
  icp: {
    geo: { countries: ["United States"] },
    positions: { titles_strict: ["CEO", "Founder"] },
    industries: ["Technology"],
    company_size: { employee_ranges: ["1,10", "11,50"] },
  },
  limits: { target_leads: 5, max_runtime_ms: 25000 },
  minio_payload: {
    product: {
      name: "Test Apollo → MinIO",
      description: "Проверка: результаты Apollo попадают в MinIO",
      goal_type: "MANUAL_GOAL",
      goal_description: "Тест",
    },
    segments: [{ name: "Apollo", personalization: "" }],
  },
};

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_MS = 35000;

async function main() {
  console.log("=== Тест: leadgen → Apollo → MinIO ===\n");
  console.log("BASE_URL:", BASE);
  console.log("target_leads: 5, max_runtime_ms: 25s\n");

  let jobId;
  try {
    const createRes = await fetch(`${BASE}/api/leadgen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PAYLOAD),
    });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.job_id) {
      console.error("❌ POST /api/leadgen failed:", createJson);
      process.exit(1);
    }
    jobId = createJson.job_id;
    console.log("1. Job created:", jobId);
  } catch (e) {
    console.error("❌ Request failed:", e.message);
    process.exit(1);
  }

  await fetch(`${BASE}/api/leadgen/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId }),
  }).catch(() => {});

  console.log("2. Worker triggered, polling...");
  let result;
  const start = Date.now();
  while (Date.now() - start < POLL_MAX_MS) {
    const getRes = await fetch(`${BASE}/api/leadgen/${jobId}`);
    result = await getRes.json();
    console.log("   status:", result.status, "leads_count:", result.leads_count ?? 0);
    if (result.status === "done" || result.status === "failed") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!result) {
    console.error("❌ Timeout");
    process.exit(1);
  }
  if (result.status === "failed") {
    console.error("❌ Job failed:", result.error);
    process.exit(1);
  }

  console.log("\n3. Job done. leads_count:", result.leads_count ?? 0);

  if (!result.minio_object_key) {
    if ((result.leads_count ?? 0) > 0) {
      console.log("⚠ Лиды от Apollo есть, но в MinIO файл не записан (minio_object_key пустой).");
      console.log("   Задай в .env.local: MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY");
      console.log("   и перезапусти npm run dev, затем снова запусти тест.");
    } else {
      console.log("⚠ minio_object_key пустой (при 0 лидов файл не создаётся). Проверь APOLLO_API_KEY в .env.local.");
    }
    console.log("\n=== Конец теста ===");
    process.exit((result.leads_count ?? 0) > 0 ? 1 : 0);
  }

  console.log("   MinIO key:", result.minio_object_key);

  // Проверка: читаем из MinIO и показываем, что там лежат результаты Apollo
  try {
    const verifyRes = await fetch(`${BASE}/api/demo-import/verify?key=${encodeURIComponent(result.minio_object_key)}`);
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok) {
      console.error("❌ MinIO verify failed:", verifyJson.error || verifyRes.status);
      process.exit(1);
    }
    const p = verifyJson.payload;
    console.log("\n4. Проверка MinIO (результаты Apollo в файле):");
    console.log("   product:", p.product?.name ?? "-");
    const segs = p.segments ?? [];
    for (let i = 0; i < segs.length; i++) {
      const leads = segs[i].leads ?? [];
      console.log("   segment", i, JSON.stringify(segs[i].name), "→ leads:", leads.length);
      if (leads.length > 0) {
        console.log("     первые 3 LinkedIn URL (от Apollo):");
        leads.slice(0, 3).forEach((u, j) => console.log("      ", j + 1, u));
      }
    }
    const totalLeads = segs.reduce((acc, s) => acc + (s.leads?.length ?? 0), 0);
    if (totalLeads > 0) {
      console.log("\n✅ В MinIO попало", totalLeads, "результатов от Apollo (LinkedIn URL).");
    } else {
      console.log("\n⚠ В MinIO segments[].leads пустые.");
    }
  } catch (e) {
    console.error("❌ Ошибка проверки MinIO:", e.message);
    process.exit(1);
  }

  console.log("\n=== Конец теста ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
