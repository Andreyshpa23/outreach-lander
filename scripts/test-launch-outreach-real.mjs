#!/usr/bin/env node
/**
 * E2E тест реального флоу launch-outreach с данными из генерации
 * Вызывает реальный API и проверяет результаты
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

// Реальные данные из генерации (как приходят от промпта)
const REAL_PAYLOAD = {
  product: {
    name: "Test Product",
    description: "Test product description",
    goal_type: "MANUAL_GOAL",
    goal_description: "Test goal",
  },
  segments: [
    {
      name: "Growth and Marketing Leaders",
      personalization: "Test personalization",
      linkedin_filters: "Titles: Head of Growth, VP Marketing, Director of Growth. Keywords: SaaS, B2B, technology.",
    },
    {
      name: "Sales and Revenue Leaders",
      personalization: "Test personalization",
      linkedin_filters: "Titles: VP Sales, Head of Sales, Revenue Director. Keywords: B2B, SaaS, sales, outbound.",
    },
  ],
  target_audience: {
    geo: "United States, Canada, United Kingdom",
    positions: ["CEO", "VP Sales"],
    industry: "SaaS, Technology",
    company_size: "11-50, 51-200, 201-500",
  },
};

async function testLaunchOutreach() {
  console.log("=== E2E Тест launch-outreach с реальными данными ===\n");
  console.log("BASE_URL:", BASE);
  console.log("Payload:", JSON.stringify(REAL_PAYLOAD, null, 2).slice(0, 500) + "...\n");

  const startTime = Date.now();

  try {
    console.log("--- POST /api/launch-outreach ---");
    const res = await fetch(`${BASE}/api/launch-outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REAL_PAYLOAD),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Status: ${res.status} (${elapsed}s)`);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("❌ Error:", errorText.slice(0, 500));
      process.exit(1);
    }

    const data = await res.json();
    console.log("\n--- Response ---");
    console.log(JSON.stringify(data, null, 2));

    if (!data.success) {
      console.error("❌ API returned success=false");
      console.error("Error:", data.error);
      process.exit(1);
    }

    console.log("\n--- Results ---");
    console.log(`✅ Success: ${data.success}`);
    console.log(`✅ Leads count: ${data.leads_count ?? 0}`);
    console.log(`✅ CSV URL: ${data.download_csv_url ? "present" : "missing"}`);
    console.log(`✅ MinIO key: ${data.key ?? "missing"}`);

    if ((data.leads_count ?? 0) === 0) {
      console.error("\n❌ ПРОБЛЕМА: 0 лидов собрано!");
      console.error("Нужно проверить логи Apollo и fallback механизм");
      process.exit(1);
    }

    if (!data.download_csv_url) {
      console.error("\n❌ ПРОБЛЕМА: CSV URL отсутствует!");
      process.exit(1);
    }

    console.log("\n✅ ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!");
    console.log(`   Собрано ${data.leads_count} лидов`);
    console.log(`   CSV доступен по ссылке`);

  } catch (e) {
    console.error("❌ Request failed:", e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

// Проверяем, что сервер запущен
async function checkServer() {
  try {
    const res = await fetch(`${BASE}/`);
    if (res.ok) {
      console.log("✅ Server is running\n");
      return true;
    }
  } catch (e) {
    console.error(`❌ Server not running at ${BASE}`);
    console.error("   Start server with: npm run dev");
    process.exit(1);
  }
}

async function main() {
  await checkServer();
  await testLaunchOutreach();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
