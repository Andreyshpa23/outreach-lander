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
    input.limits = input.limits || {};
    input.limits.target_leads = 10;
    input.limits.max_runtime_ms = 35000;
    console.log("   (test: target_leads=10 for faster run and more chance of LinkedIn from search)");
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

  console.log("\n3. Verify MinIO file and check LinkedIn URLs...");
  try {
    const verifyRes = await fetch(`${BASE}/api/demo-import/verify?key=${encodeURIComponent(key)}`);
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok) {
      console.error("❌ verify failed:", verifyJson.error || verifyRes.status);
      process.exit(1);
    }
    const p = verifyJson.payload;
    const segs = p?.segments ?? [];
    console.log("   product:", p?.product?.name ?? "-");

    const isLinkedInUrl = (url) => typeof url === "string" && url.trim().includes("linkedin.com") && !url.includes("apollo.io");
    const isApolloUrl = (url) => typeof url === "string" && url.includes("apollo.io");
    const allLeadsUrls = [];
    const allDetailLinkedIn = [];
    const badUrls = [];

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const leads = s.leads ?? [];
      const detail = s.leads_detail ?? [];
      console.log("   segment", i, s.name, "→ leads:", leads.length, "leads_detail:", detail.length);

      for (const url of leads) {
        allLeadsUrls.push(url);
        if (url && !isLinkedInUrl(url)) {
          if (isApolloUrl(url)) badUrls.push({ from: "leads", url: url.slice(0, 80), segment: i });
          else if (url.trim()) badUrls.push({ from: "leads", url: url.slice(0, 80), segment: i });
        }
      }
      for (const d of detail) {
        const u = d.linkedin_url;
        if (u && isLinkedInUrl(u)) allDetailLinkedIn.push(u);
      }
    }

    const linkedInInLeads = allLeadsUrls.filter(isLinkedInUrl);
    const linkedInInDetail = [...new Set(allDetailLinkedIn)];

    console.log("\n   --- Проверка URL в финальном файле ---");
    console.log("   segments[].leads: всего", allLeadsUrls.length, ", из них LinkedIn:", linkedInInLeads.length);
    console.log("   leads_detail[].linkedin_url (LinkedIn):", linkedInInDetail.length);
    if (badUrls.length > 0) {
      console.error("   ❌ В segments[].leads найдены НЕ LinkedIn URL:", badUrls.length);
      badUrls.slice(0, 5).forEach((b) => console.error("      ", b.from, b.segment, b.url));
    }
    if (linkedInInLeads.length > 0) {
      console.log("   Примеры LinkedIn URL из leads:");
      linkedInInLeads.slice(0, 3).forEach((u) => console.log("      ", u));
    }

    const totalLeads = allLeadsUrls.length;
    const totalDetail = segs.reduce((acc, s) => acc + (s.leads_detail ?? []).length, 0);
    const minLinkedInRequired = 1;

    if (badUrls.length > 0) {
      console.error("\n❌ ТЕСТ НЕ ПРОЙДЕН: в финальном файле в segments[].leads есть не-LinkedIn URL (должны быть только linkedin.com).");
      process.exit(1);
    }
    if (totalLeads > 0 && linkedInInLeads.length < minLinkedInRequired) {
      console.error("\n❌ ТЕСТ НЕ ПРОЙДЕН: в файле", totalLeads, "URL в leads, но ни один не является LinkedIn (linkedin.com).");
      process.exit(1);
    }
    if (totalDetail > 0 && linkedInInLeads.length < minLinkedInRequired) {
      console.error("\n❌ ТЕСТ НЕ ПРОЙДЕН: в файле", totalDetail, "лидов в leads_detail, но в segments[].leads нет ни одного LinkedIn URL (ожидаются именно linkedin.com).");
      console.error("\n   Подсказка: открой GET " + BASE + "/api/leadgen/apollo-sample — проверь first_person (linkedin_url, linkedin_slug).");
      console.error("   Если в поиске Apollo нет linkedin_url — нужны кредиты People Enrichment (Apollo → Billing / Usage).");
      process.exit(1);
    }
    if (totalLeads > 0) {
      console.log("\n✅ E2E OK: в MinIO", totalLeads, "лидов, все URL в leads — LinkedIn.");
    } else if (totalDetail === 0) {
      console.log("\n⚠ В MinIO 0 лидов (Apollo мог вернуть пусто или таймаут).");
    } else {
      console.log("\n✅ E2E OK: в MinIO", totalDetail, "лидов в leads_detail,", linkedInInLeads.length, "LinkedIn URL в leads.");
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
