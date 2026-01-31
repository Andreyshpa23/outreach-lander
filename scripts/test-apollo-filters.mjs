#!/usr/bin/env node
/**
 * Тест: проверка Apollo запроса с конкретными фильтрами.
 * Показывает, какие фильтры отправляются в Apollo, и результат запроса.
 * 
 * Использование:
 *   node scripts/test-apollo-filters.mjs
 * 
 * Или с кастомными фильтрами (пример):
 *   node scripts/test-apollo-filters.mjs '{"linkedin_filters": "Titles: CEO, Founder. Keywords: SaaS, B2B."}'
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local если есть
try {
  const envPath = join(__dirname, '..', '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  });
} catch (e) {
  console.log('⚠ .env.local не найден, используем переменные окружения из системы');
}

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
if (!APOLLO_API_KEY) {
  console.error('❌ APOLLO_API_KEY не установлен в .env.local или переменных окружения');
  process.exit(1);
}

// Парсим аргументы командной строки
const args = process.argv.slice(2);
let testLinkedinFilters = null;
if (args.length > 0) {
  try {
    const parsed = JSON.parse(args[0]);
    testLinkedinFilters = parsed.linkedin_filters;
  } catch (e) {
    console.log('⚠ Не удалось распарсить аргумент, используем дефолтные фильтры');
  }
}

// Симулируем парсинг linkedin_filters как в launch-outreach
function linkedinFiltersToIcpAddition(linkedinFilters) {
  if (!linkedinFilters || typeof linkedinFilters !== "string") return {};
  const raw = linkedinFilters.trim();
  if (!raw.length) return {};

  let titles = [];
  let keywords = [];

  const titlesMatch = raw.match(/\bTitles?\s*:\s*([^.]+?)(?=\s*\.?\s*Keywords?\s*:|$)/i);
  const keywordsMatch = raw.match(/\bKeywords?\s*:\s*(.+)$/i);

  if (titlesMatch) {
    titles = titlesMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  if (keywordsMatch) {
    keywords = keywordsMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/\.+$/, ""))
      .filter(Boolean)
      .slice(0, 10);
  }

  if (titles.length > 0 || keywords.length > 0) {
    return {
      positions: titles.length > 0 ? { titles_strict: titles } : undefined,
      industry_keywords: keywords.length > 0 ? keywords : (titles.length > 0 ? titles : undefined),
    };
  }

  // Fallback
  const tokens = raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tokens.length) return {};
  const fallbackTitles = tokens.slice(0, 5);
  return {
    positions: { titles_strict: fallbackTitles },
    industry_keywords: tokens,
  };
}

// Симулируем mapIcpToApolloFilters (упрощенная версия для "strict")
function mapIcpToApolloFilters(icp) {
  const filters = {};
  
  if (icp.positions?.titles_strict?.length) {
    filters.person_titles = icp.positions.titles_strict;
  }
  
  const keywords = icp.industry_keywords ?? [];
  if (keywords.length) {
    filters.q_keywords = keywords.join(", ");
  }
  
  if (icp.company_size?.employee_ranges?.length) {
    filters.organization_num_employees = icp.company_size.employee_ranges.map(r => {
      const s = String(r).trim();
      if (s.includes("-")) return s;
      if (s.includes(",")) return s.replace(",", "-");
      return s;
    });
  }
  
  if (icp.geo?.countries?.length) {
    filters.person_locations = icp.geo.countries;
    filters.organization_locations = icp.geo.countries;
  }
  
  if (icp.industries?.length) {
    const numeric = icp.industries.filter(s => /^\d+$/.test(String(s).trim()));
    if (numeric.length) {
      filters.q_organization_industry_tag_ids = numeric;
    }
  }
  
  return filters;
}

async function testApolloRequest(filters, description) {
  console.log(`\n=== ${description} ===`);
  console.log('Фильтры для Apollo API:');
  console.log(JSON.stringify(filters, null, 2));
  
  const body = {
    api_key: APOLLO_API_KEY,
    page: 1,
    per_page: 10, // Маленький лимит для теста
    ...filters,
  };
  
  console.log('\n--- Запрос к Apollo API ---');
  console.log('URL: https://api.apollo.io/api/v1/mixed_people/api_search');
  console.log('Body:', JSON.stringify(body, null, 2));
  
  try {
    const start = Date.now();
    const res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify(body),
    });
    
    const elapsed = Date.now() - start;
    const status = res.status;
    
    console.log(`\n--- Ответ Apollo ---`);
    console.log(`Status: ${status}`);
    console.log(`Время: ${elapsed}ms`);
    
    if (!res.ok) {
      const text = await res.text();
      console.log(`❌ Ошибка: ${text.slice(0, 500)}`);
      return { success: false, status, error: text };
    }
    
    const data = await res.json();
    const people = data.people ?? data.data?.people ?? data.contacts ?? [];
    const pagination = data.pagination ?? data.data?.pagination;
    
    console.log(`✅ Найдено людей: ${people.length}`);
    if (pagination) {
      console.log(`   Всего страниц: ${pagination.total_pages ?? '?'}`);
      console.log(`   Всего записей: ${pagination.total_entries ?? '?'}`);
    }
    
    if (people.length > 0) {
      console.log('\n--- Первые 3 результата ---');
      people.slice(0, 3).forEach((p, i) => {
        console.log(`\n${i + 1}. ${p.name || p.first_name + ' ' + p.last_name || 'N/A'}`);
        console.log(`   Title: ${p.title || 'N/A'}`);
        console.log(`   Company: ${p.organization?.name || 'N/A'}`);
        console.log(`   LinkedIn: ${p.linkedin_url || p.linkedin_profile_url || 'N/A'}`);
      });
    } else {
      console.log('\n⚠ Результатов нет. Возможные причины:');
      console.log('   - Фильтры слишком строгие');
      console.log('   - Неправильный формат фильтров');
      console.log('   - Проблемы с Apollo API');
    }
    
    return { success: true, status, people: people.length, pagination };
  } catch (e) {
    console.error(`❌ Ошибка запроса:`, e.message);
    return { success: false, error: e.message };
  }
}

async function main() {
  console.log('=== Тест Apollo API запроса ===\n');
  
  // Тест 1: Дефолтные фильтры (если не переданы)
  const linkedinFilters = testLinkedinFilters || "Titles: CEO, Founder, VP Sales. Keywords: SaaS, B2B, technology.";
  console.log(`Используем linkedin_filters: "${linkedinFilters}"`);
  
  const icpAddition = linkedinFiltersToIcpAddition(linkedinFilters);
  console.log('\n--- Парсинг linkedin_filters → ICP addition ---');
  console.log(JSON.stringify(icpAddition, null, 2));
  
  // Базовая ICP (можно расширить)
  const baseIcp = {
    geo: { countries: ["United States"] },
    company_size: { employee_ranges: ["1-10", "11-50", "51-200"] },
  };
  
  const mergedIcp = {
    ...baseIcp,
    ...icpAddition,
    positions: icpAddition.positions ?? baseIcp.positions,
    industry_keywords: [
      ...(baseIcp.industry_keywords ?? []),
      ...(icpAddition.industry_keywords ?? [])
    ].filter(Boolean),
  };
  
  console.log('\n--- Merged ICP (base + segment filters) ---');
  console.log(JSON.stringify(mergedIcp, null, 2));
  
  const apolloFilters = mapIcpToApolloFilters(mergedIcp);
  
  await testApolloRequest(apolloFilters, 'Тест с парсингом linkedin_filters');
  
  // Тест 2: Минимальные фильтры (только titles)
  console.log('\n\n=== Тест 2: Только Titles (без Keywords) ===');
  const icpOnlyTitles = {
    positions: { titles_strict: ["CEO", "Founder"] },
  };
  const apolloFiltersOnlyTitles = mapIcpToApolloFilters(icpOnlyTitles);
  await testApolloRequest(apolloFiltersOnlyTitles, 'Только Titles');
  
  // Тест 3: Только Keywords (без Titles)
  console.log('\n\n=== Тест 3: Только Keywords (без Titles) ===');
  const icpOnlyKeywords = {
    industry_keywords: ["SaaS", "B2B", "technology"],
  };
  const apolloFiltersOnlyKeywords = mapIcpToApolloFilters(icpOnlyKeywords);
  await testApolloRequest(apolloFiltersOnlyKeywords, 'Только Keywords');
  
  console.log('\n=== Конец теста ===');
}

main().catch(e => {
  console.error('❌ Ошибка:', e);
  process.exit(1);
});
