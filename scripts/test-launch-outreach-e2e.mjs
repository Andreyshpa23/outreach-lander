#!/usr/bin/env node
/**
 * E2E тест: launch-outreach → leadgen/run (с input) → проверка MinIO.
 * Проверяет полный флоу как на проде (без job store).
 *
 * Запуск: node scripts/test-launch-outreach-e2e.mjs
 * Сервер: npm run dev (BASE_URL=http://localhost:3000)
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const RUN_TIMEOUT_MS = 70000;

const LAUNCH_PAYLOAD = {
  product: {
    name: "E2E Test Product",
    description: "Test description for launch-outreach e2e",
    goal_type: "MANUAL_GOAL",
    goal_description: "Test",
  },
  segments: [{ name: "Segment A", personalization: "Test" }],
  target_audience: {
    geo: "United States",
    positions: ["CEO", "Founder"],
    industry: "Technology",
    company_size: "1-50",
  },
};

async function main() {
  console.log("=== E2E: launch-outreach → leadgen/run → MinIO ===\n");
  console.log("BASE:", BASE);
  console.log("");

  let key, job_id, input;
  try {
    const res = await fetch(`${BASE}/api/launch-outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(LAUNCH_PAYLOAD),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.key) {
      console.error("❌ POST /api/launch-outreach failed:", res.status, data);
      process.exit(1);
    }
    key = data.key;
    job_id = data.job_id;
    input = data.input;
    console.log("1. launch-outreach OK → key:", key, "job_id:", job_id);
    if (!job_id || !input) {
      console.error("❌ No job_id or input in response");
      process.exit(1);
    }
  } catch (e) {
    console.error("❌ launch-outreach request failed:", e.message);
    process.exit(1);
  }

  console.log("2. Calling /api/leadgen/run (await, max", RUN_TIMEOUT_MS / 1000, "s)...");
  const runStart = Date.now();
  let runOk = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
    const runRes = await fetch(`${BASE}/api/leadgen/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id, input }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const runElapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    if (runRes.ok) {
      const runJson = await runRes.json().catch(() => ({}));
      console.log("   run OK in", runElapsed, "s", runJson);
      runOk = true;
    } else {
      const text = await runRes.text().catch(() => "");
      console.error("❌ leadgen/run failed:", runRes.status, text.slice(0, 300));
    }
  } catch (e) {
    const runElapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    if (e.name === "AbortError") {
      console.error("❌ leadgen/run timeout after", runElapsed, "s");
    } else {
      console.error("❌ leadgen/run error:", e.message);
    }
    process.exit(1);
  }

  if (!runOk) process.exit(1);

  console.log("\n3. Verify MinIO file...");
  try {
    const verifyRes = await fetch(`${BASE}/api/demo-import/verify?key=${encodeURIComponent(key)}`);
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok) {
      console.error("❌ verify failed:", verifyJson.error || verifyRes.status);
      process.exit(1);
    }
    const p = verifyJson.payload;
    const segs = p?.segments ?? [];
    const totalLeads = segs.reduce((acc, s) => acc + (s.leads?.length ?? 0), 0);
    console.log("   product:", p?.product?.name ?? "-");
    segs.forEach((s, i) => {
      const n = (s.leads ?? []).length;
      console.log("   segment", i, s.name, "→ leads:", n);
    });
    if (totalLeads > 0) {
      console.log("\n✅ E2E OK: в MinIO", totalLeads, "лидов (LinkedIn URL).");
    } else {
      console.log("\n⚠ В MinIO 0 лидов (Apollo мог вернуть пусто или таймаут).");
    }
  } catch (e) {
    console.error("❌ verify error:", e.message);
    process.exit(1);
  }

  console.log("\n=== Конец теста ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
