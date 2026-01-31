#!/usr/bin/env node
/**
 * Тест реального флоу с данными из генерации
 * Использует те же фильтры, что приходят от промпта generate
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
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
  console.log('⚠ .env.local не найден');
}

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
if (!APOLLO_API_KEY) {
  console.error('❌ APOLLO_API_KEY не установлен');
  process.exit(1);
}

// Реальные данные из логов пользователя
const REAL_DATA = {
  product: {
    name: "Test Product",
    description: "Test",
  },
  segments: [
    {
      name: "Growth and Marketing Leaders",
      linkedin_filters: "Titles: Head of Growth, VP Marketing, Director of Growth. Keywords: SaaS, B2B, technology.",
      personalization: ""
    },
    {
      name: "Sales and Revenue Leaders", 
      linkedin_filters: "Titles: VP Sales, Head of Sales, Revenue Director. Keywords: B2B, SaaS, sales, outbound.",
      personalization: ""
    }
  ],
  target_audience: {
    geo: "United States, Canada, United Kingdom",
    positions: ["CEO", "VP Sales"],
    industry: "SaaS, Technology",
    company_size: "11-50, 51-200, 201-500" // Правильный формат с дефисом
  }
};

// Симулируем парсинг как в launch-outreach
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

  const tokens = raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  if (!tokens.length) return {};
  return {
    positions: { titles_strict: tokens.slice(0, 5) },
    industry_keywords: tokens,
  };
}

function targetAudienceToIcp(ta) {
  const countries = ta.geo ? ta.geo.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const industries = ta.industry ? ta.industry.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  
  // ИСПРАВЛЕНО: сохраняем дефис формат, не конвертируем в запятую
  const employeeRanges = ta.company_size
    ? ta.company_size
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
    
  return {
    geo: countries?.length ? { countries } : undefined,
    positions: ta.positions?.length ? { titles_strict: ta.positions } : undefined,
    industries: industries?.length ? industries : undefined,
    company_size: employeeRanges?.length ? { employee_ranges: employeeRanges } : undefined,
  };
}

function toApolloEmployeeRanges(ranges) {
  return ranges.map((r) => {
    const s = String(r).trim();
    if (s.includes("-")) return s; // Уже правильный формат
    if (s.includes(",")) {
      const converted = s.replace(",", "-");
      console.log(`[test] Converted "${s}" -> "${converted}"`);
      return converted;
    }
    if (/^\d+\+$/.test(s)) return s;
    return s;
  }).filter(Boolean);
}

function mapIcpToApolloFilters(icp, step = "strict") {
  const filters = {};
  
  if (icp.positions?.titles_strict?.length) {
    filters.person_titles = icp.positions.titles_strict;
  }
  
  const keywords = [...(icp.industry_keywords ?? []), ...(icp.industries ?? [])];
  if (keywords.length) {
    filters.q_keywords = keywords.join(", ");
  }
  
  if (icp.company_size?.employee_ranges?.length) {
    filters.organization_num_employees = toApolloEmployeeRanges(icp.company_size.employee_ranges);
  }
  
  if (icp.geo?.countries?.length) {
    filters.person_locations = icp.geo.countries;
    filters.organization_locations = icp.geo.countries;
  }
  
  return filters;
}

async function testApolloRequest(filters, description) {
  console.log(`\n=== ${description} ===`);
  console.log('Фильтры:', JSON.stringify(filters, null, 2));
  
  const body = {
    api_key: APOLLO_API_KEY,
    page: 1,
    per_page: 10,
    ...filters,
  };
  
  try {
    const res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.log(`❌ Status ${res.status}: ${text.slice(0, 300)}`);
      return { success: false, people: 0 };
    }
    
    const data = await res.json();
    const people = data.people ?? data.data?.people ?? data.contacts ?? [];
    const pagination = data.pagination ?? data.data?.pagination;
    
    console.log(`✅ Найдено: ${people.length} людей`);
    if (pagination) {
      console.log(`   Всего: ${pagination.total_entries ?? '?'}`);
    }
    
    if (people.length > 0) {
      console.log(`\nПервые 3:`);
      people.slice(0, 3).forEach((p, i) => {
        console.log(`  ${i+1}. ${p.name || p.first_name + ' ' + p.last_name || 'N/A'}`);
        console.log(`     Title: ${p.title || 'N/A'}`);
        console.log(`     Company: ${p.organization?.name || 'N/A'}`);
      });
    }
    
    return { success: true, people: people.length, total: pagination?.total_entries ?? 0 };
  } catch (e) {
    console.error(`❌ Ошибка:`, e.message);
    return { success: false, people: 0 };
  }
}

async function main() {
  console.log('=== Тест реального флоу с данными из генерации ===\n');
  
  const baseIcp = targetAudienceToIcp(REAL_DATA.target_audience);
  console.log('Base ICP:', JSON.stringify(baseIcp, null, 2));
  
  // Тест каждого сегмента
  for (let i = 0; i < REAL_DATA.segments.length; i++) {
    const seg = REAL_DATA.segments[i];
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`СЕГМЕНТ ${i}: ${seg.name}`);
    console.log(`linkedin_filters: "${seg.linkedin_filters}"`);
    
    const addition = linkedinFiltersToIcpAddition(seg.linkedin_filters);
    console.log('\nParsed addition:', JSON.stringify(addition, null, 2));
    
    const segmentIcp = {
      ...baseIcp,
      ...addition,
      positions: addition.positions ?? baseIcp.positions,
      industry_keywords: [
        ...(baseIcp.industry_keywords ?? []),
        ...(addition.industry_keywords ?? [])
      ].filter(Boolean),
    };
    
    console.log('\nMerged segment ICP:', JSON.stringify(segmentIcp, null, 2));
    
    // Тест 1: Все фильтры (strict)
    const filtersStrict = mapIcpToApolloFilters(segmentIcp, "strict");
    const resultStrict = await testApolloRequest(filtersStrict, `Segment ${i} - STRICT (все фильтры)`);
    
    // Тест 2: Только titles (fallback)
    if (resultStrict.people === 0) {
      console.log('\n⚠️ 0 результатов со strict, пробуем только titles...');
      const filtersTitlesOnly = { person_titles: segmentIcp.positions?.titles_strict };
      await testApolloRequest(filtersTitlesOnly, `Segment ${i} - ТОЛЬКО TITLES`);
    }
    
    // Тест 3: Только keywords (fallback)
    if (resultStrict.people === 0) {
      const keywords = [...(segmentIcp.industry_keywords ?? []), ...(segmentIcp.industries ?? [])];
      if (keywords.length > 0) {
        console.log('\n⚠️ 0 результатов с titles, пробуем только keywords...');
        const filtersKeywordsOnly = { q_keywords: keywords.join(", ") };
        await testApolloRequest(filtersKeywordsOnly, `Segment ${i} - ТОЛЬКО KEYWORDS`);
      }
    }
  }
  
  console.log('\n\n=== Конец теста ===');
}

main().catch(e => {
  console.error('❌ Ошибка:', e);
  process.exit(1);
});
