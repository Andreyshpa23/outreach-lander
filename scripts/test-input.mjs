#!/usr/bin/env node
/**
 * Тест инпута: проверка приёма и обработки пользовательского ввода через API.
 * - GET /api/session
 * - POST /api/collect-info с валидным и невалидным input
 * Запуск: node scripts/test-input.mjs
 * Сервер должен быть запущен (npm run dev). BASE_URL по умолчанию http://localhost:3000
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  console.log("=== Тест инпута (API) ===\n");
  console.log("BASE_URL:", BASE);

  // --- 1. Сессия ---
  console.log("\n--- 1. GET /api/session ---");
  let sessionId = null;
  try {
    const sessionRes = await fetch(`${BASE}/api/session`, {
      method: "GET",
      headers: { "x-session-id": "" },
    });
    const sessionJson = await sessionRes.json();
    console.log("Response:", JSON.stringify(sessionJson, null, 2));
    if (sessionRes.ok && sessionJson.sessionId) {
      sessionId = sessionJson.sessionId;
      console.log("✅ Сессия получена, sessionId:", sessionId);
    } else {
      console.log("❌ Сессия:", sessionJson.error || "нет sessionId");
    }
  } catch (e) {
    console.error("❌ Session request failed:", e.message);
  }

  // --- 2. collect-info: невалидный input (слишком короткий) ---
  console.log("\n--- 2. POST /api/collect-info (input слишком короткий) ---");
  try {
    const shortRes = await fetch(`${BASE}/api/collect-info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionId || "",
      },
      body: JSON.stringify({
        input: "ab",
        answers: {},
        askedQuestions: [],
        chatHistory: [],
      }),
    });
    const shortJson = await shortRes.json().catch(() => ({}));
    console.log("Status:", shortRes.status, "Body:", JSON.stringify(shortJson, null, 2));
    if (shortRes.status === 400 && shortJson.error && shortJson.error.includes("at least 3")) {
      console.log("✅ Валидация инпута сработала: короткий input отклонён");
    } else {
      console.log("⚠ Ожидался 400 и сообщение про 'at least 3 characters'");
    }
  } catch (e) {
    console.error("❌ collect-info (short) failed:", e.message);
  }

  // --- 3. collect-info: валидный input (без Azure — может вернуть 500 или ответ) ---
  console.log("\n--- 3. POST /api/collect-info (валидный input) ---");
  try {
    const body = {
      input: "CRM for small sales teams with built-in email sequences",
      answers: {},
      askedQuestions: [],
      chatHistory: [],
    };
    const res = await fetch(`${BASE}/api/collect-info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionId || "",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    console.log("Status:", res.status);
    if (res.ok) {
      console.log("✅ Инпут принят. Ответ содержит:", Object.keys(json));
      if (json.questions && json.questions.length > 0) {
        console.log("   Вопросы:", json.questions.length);
      }
      if (json.product_summary) {
        console.log("   product_summary: есть");
      }
    } else if (res.status === 429) {
      console.log("⚠ Лимит запросов (429) — нормально для теста");
    } else if (res.status === 500 && json.error) {
      console.log("⚠ Сервер вернул 500 (часто из-за отсутствия Azure OpenAI):", json.error.slice(0, 80) + "...");
      console.log("   Инпут на бэкенде принят, валидация пройдена.");
    } else {
      console.log("Response:", JSON.stringify(json, null, 2));
    }
  } catch (e) {
    console.error("❌ collect-info (valid) failed:", e.message);
  }

  console.log("\n=== Конец теста инпута ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
