#!/usr/bin/env node
/**
 * Прямой тест leadgen worker с реальными данными
 * Тестирует runSearchForIcp напрямую без API
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

// Импортируем функции напрямую
const { searchPeople } = await import('../src/lib/leadgen/apollo-client.ts');
const { normalizePerson, isLeadValid } = await import('../src/lib/leadgen/normalize.ts');

// Реальные данные из генерации
const REAL_SEGMENTS = [
  {
    name: "Growth and Marketing Leaders",
    linkedin_filters: "Titles: Head of Growth, VP Marketing, Director of Growth. Keywords: SaaS, B2B, technology.",
  },
  {
    name: "Sales and Revenue Leaders",
    linkedin_filters: "Titles: VP Sales, Head of Sales, Revenue Director. Keywords: B2B, SaaS, sales, outbound.",
  }
];

function linkedinFiltersToIcp(linkedinFilters) {
  if (!linkedinFilters) return {};
  const raw = linkedinFilters.trim();
  let titles = [];
  let keywords = [];
  const titlesMatch = raw.match(/\bTitles?\s*:\s*([^.]+?)(?=\s*\.?\s*Keywords?\s*:|$)/i);
  const keywordsMatch = raw.match(/\bKeywords?\s*:\s*(.+)$/i);
  if (titlesMatch) {
    titles = titlesMatch[1].split(",").map(s => s.trim()).filter(Boolean);
  }
  if (keywordsMatch) {
    keywords = keywordsMatch[1].split(",").map(s => s.trim().replace(/\.+$/, "")).filter(Boolean);
  }
  return {
    positions: titles.length > 0 ? { titles_strict: titles } : undefined,
    industry_keywords: keywords.length > 0 ? keywords : undefined,
  };
}

async function testSegment(seg, segmentIndex) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`СЕГМЕНТ ${segmentIndex}: ${seg.name}`);
  console.log(`linkedin_filters: "${seg.linkedin_filters}"`);
  
  const icpAddition = linkedinFiltersToIcp(seg.linkedin_filters);
  const segmentIcp = {
    ...icpAddition,
    geo: { countries: ["United States", "Canada", "United Kingdom"] },
    company_size: { employee_ranges: ["11-50", "51-200", "201-500"] },
    industries: ["SaaS", "Technology"],
  };
  
  console.log('\nSegment ICP:', JSON.stringify(segmentIcp, null, 2));
  
  // Тест 1: Все фильтры (должно вернуть 0)
  const allFilters = {
    person_titles: segmentIcp.positions?.titles_strict,
    q_keywords: [...(segmentIcp.industry_keywords ?? []), ...(segmentIcp.industries ?? [])].join(", "),
    organization_num_employees: segmentIcp.company_size?.employee_ranges,
    person_locations: segmentIcp.geo?.countries,
    organization_locations: segmentIcp.geo?.countries,
  };
  
  console.log('\n--- Тест 1: Все фильтры (strict) ---');
  const res1 = await searchPeople(allFilters, 1, 10);
  console.log(`Результат: ${res1.people?.length ?? 0} людей`);
  
  // Тест 2: Только titles (fallback)
  if ((res1.people?.length ?? 0) === 0) {
    console.log('\n--- Тест 2: Fallback - только titles ---');
    const titlesOnly = { person_titles: segmentIcp.positions?.titles_strict };
    const res2 = await searchPeople(titlesOnly, 1, 10);
    console.log(`Результат: ${res2.people?.length ?? 0} людей`);
    
    if ((res2.people?.length ?? 0) > 0) {
      const leads = [];
      const seen = new Set();
      for (const person of res2.people) {
        const lead = normalizePerson(person);
        if (!isLeadValid(lead)) continue;
        const dedupeKey = lead.linkedin_url || lead.apollo_person_id;
        if (!dedupeKey || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        leads.push(lead);
      }
      console.log(`✅ Валидных лидов: ${leads.length}`);
      if (leads.length > 0) {
        console.log(`   Первый: ${leads[0].full_name} - ${leads[0].title} at ${leads[0].company_name}`);
        console.log(`   LinkedIn: ${leads[0].linkedin_url || 'N/A'}`);
      }
      return leads.length;
    }
  }
  
  return 0;
}

async function main() {
  console.log('=== Прямой тест leadgen worker ===\n');
  
  let totalLeads = 0;
  for (let i = 0; i < REAL_SEGMENTS.length; i++) {
    const leads = await testSegment(REAL_SEGMENTS[i], i);
    totalLeads += leads;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ИТОГО: ${totalLeads} лидов собрано`);
  
  if (totalLeads === 0) {
    console.error('\n❌ ПРОБЛЕМА: 0 лидов!');
    process.exit(1);
  } else {
    console.log('\n✅ ТЕСТ ПРОШЕЛ УСПЕШНО!');
  }
}

main().catch(e => {
  console.error('❌ Ошибка:', e);
  process.exit(1);
});
