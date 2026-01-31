#!/usr/bin/env node
/**
 * Тест launch-outreach на опубликованном сайте (не localhost).
 * Вызывает POST /api/launch-outreach и проверяет, что в ответе есть download_csv_url и лиды.
 *
 * Запуск: PRODUCTION_URL=https://demo.salestrigger.io node scripts/test-launch-production.mjs
 * Или:   BASE_URL=https://your-vercel-app.vercel.app node scripts/test-launch-production.mjs
 */

const BASE = process.env.PRODUCTION_URL || process.env.BASE_URL || "https://demo.salestrigger.io";
const REQUEST_TIMEOUT_MS = 70000;

const PAYLOAD = {
  product: {
    name: "Production Test",
    description: "Test",
    goal_type: "MANUAL_GOAL",
    goal_description: "Test",
  },
  segments: [
    { name: "Segment A", personalization: "Test", linkedin_filters: "CEO, Founder" },
  ],
  target_audience: { industry: "Technology" },
};

async function main() {
  console.log("=== Тест launch-outreach на продакшене ===\n");
  console.log("URL:", BASE);
  console.log("Таймаут запроса:", REQUEST_TIMEOUT_MS / 1000, "сек\n");

  const start = Date.now();
  let res;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    res = await fetch(`${BASE}/api/launch-outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PAYLOAD),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (e.name === "AbortError") {
      console.error("❌ Таймаут запроса после", elapsed, "сек. На Vercel Free лимит 10 сек — функция могла быть убита.");
    } else {
      console.error("❌ Ошибка запроса:", e.message);
    }
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const data = await res.json().catch(() => ({}));

  console.log("Ответ получен за", elapsed, "сек");
  console.log("Status:", res.status);
  console.log("success:", data.success);
  console.log("key:", data.key ?? "(нет)");
  console.log("job_id:", data.job_id ?? "(нет)");
  console.log("leads_count:", data.leads_count ?? "(нет)");
  console.log("download_csv_url:", data.download_csv_url ? "есть" : "НЕТ");

  if (!res.ok) {
    console.error("\n❌ Запрос не OK:", data.error || res.status);
    process.exit(1);
  }
  if (!data.success || !data.key) {
    console.error("\n❌ Нет success или key в ответе");
    process.exit(1);
  }
  if (!data.download_csv_url) {
    console.error("\n❌ CSV не сгенерирован (download_csv_url пустой). Возможные причины:");
    console.error("   - Vercel убил функцию по таймауту до загрузки CSV (Free: 10 сек)");
    console.error("   - Воркер не успел собрать лиды или упал с ошибкой");
    console.error("   - MinIO не настроен на продакшене");
    process.exit(1);
  }
  if ((data.leads_count ?? 0) === 0) {
    console.warn("\n⚠ leads_count = 0 (CSV может быть пустой)");
  }

  console.log("\n✅ Тест пройден: CSV сгенерирован, leads_count =", data.leads_count ?? 0);
  console.log("   Ссылка на CSV в ответе есть.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
