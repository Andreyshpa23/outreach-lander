# Рабочий Setup - ВСЕ РАБОТАЕТ ✅

**Дата сохранения:** 2026-02-01  
**Статус:** Все функции работают корректно

## Текущие настройки лимитов

### Launch Outreach (`/api/launch-outreach`)
- **target_leads:** 50 (на каждый сегмент)
- **max_runtime_ms:** 50000 (50 секунд)
- **maxDuration:** 60 секунд (Vercel Pro план)

**Результат:** Собирается до 100 лидов всего (50 × 2 сегмента)

## Ключевые компоненты системы

### 1. Apollo Filters Format
- **Формат:** `"Titles: job title 1, job title 2. Keywords: keyword1, keyword2."`
- **Парсинг:** В `launch-outreach/route.ts` функция `linkedinFiltersToIcpAddition()`
- **Маппинг:** Titles → `person_titles`, Keywords → `q_keywords`

### 2. Fallback механизм
- Если все шаги progressive widening возвращают 0 результатов
- Пробует запрос только с titles (без других фильтров)
- Если и это не работает - пробует только keywords
- **Расположение:** `src/lib/leadgen/leadgen-worker.ts` функция `runSearchForIcp()`

### 3. Enrichment LinkedIn URLs
- **Всегда запускается** если есть лиды без LinkedIn URL
- Сначала пробует `getPersonById()` (быстрее)
- Затем `enrichPerson()` если нужно
- **Время:** deadline - 1000ms (резерв 1 секунда)
- **Delay:** 50ms между запросами
- **Расположение:** `src/lib/leadgen/leadgen-worker.ts` после progressive widening

### 4. Vercel File System
- **Все операции с файлами отключены** в Vercel (in-memory только)
- **Определение Vercel:** `process.env.VERCEL || process.env.VERCEL_ENV || process.cwd() === '/var/task'`
- **Файлы:**
  - `src/lib/session-storage.ts` - in-memory sessions
  - `src/lib/leadgen/job-store.ts` - in-memory jobs
  - `src/lib/token-limiter.ts` - in-memory usage tracking

### 5. Progressive Widening Steps
1. `strict` - все фильтры
2. `broad_titles` - добавляет titles_broad
3. `relax_seniority` - убирает seniority
4. `relax_geo` - убирает geo
5. `relax_company_size` - убирает company_size
6. `relax_industries` - убирает industries

## Формат данных

### MinIO JSON (`demo-imports/{uuid}.json`)
```json
{
  "product": {
    "name": "string",
    "description": "string",
    "goal_type": "MANUAL_GOAL",
    "goal_description": "string"
  },
  "segments": [
    {
      "name": "string",
      "personalization": "string",
      "leads": ["https://linkedin.com/in/...", ...]  // Только LinkedIn URLs
    }
  ]
}
```

### CSV (`leadgen_{job_id}.csv`)
- Полные данные лидов (name, title, company, linkedin_url, etc.)
- Загружается в MinIO storage
- Presigned URL для скачивания

## Apollo API формат

### Employee Ranges
- **Формат:** `"11-50"` (дефис, не запятая)
- **Конвертация:** `toApolloEmployeeRanges()` в `icp-to-apollo.ts`
- **Apollo параметр:** `organization_num_employees: ["11-50", "51-200"]`

### Keywords
- **Формат:** Одна строка через запятую
- **Apollo параметр:** `q_keywords: "SaaS, B2B, technology"`

### Titles
- **Формат:** Массив строк
- **Apollo параметр:** `person_titles: ["CEO", "Founder", "VP Sales"]`

## Логирование

### Ключевые логи для отладки:
- `[leadgen] Enrichment START: X/Y leads need LinkedIn URL enrichment`
- `[leadgen] Enrichment completed: X/Y enriched in Zms`
- `[leadgen] ✅ segment="X" enriched Y leads with LinkedIn`
- `[leadgen] Fallback: trying only titles: [...]`
- `[leadgen] MinIO overwrite START key=... totalLeads=X`
- `[apollo] filters being sent: {...}`

## Важные файлы

### Основные:
- `src/app/api/launch-outreach/route.ts` - главный endpoint
- `src/lib/leadgen/leadgen-worker.ts` - воркер Apollo + enrichment
- `src/lib/leadgen/icp-to-apollo.ts` - маппинг ICP → Apollo filters
- `src/lib/leadgen/apollo-client.ts` - Apollo API клиент
- `src/lib/leadgen/normalize.ts` - нормализация Apollo → Lead

### Хранилище:
- `src/lib/session-storage.ts` - сессии (in-memory в Vercel)
- `src/lib/leadgen/job-store.ts` - джобы (in-memory в Vercel)
- `src/lib/demo-import-storage.ts` - MinIO upload/download

## Environment Variables (Vercel)

### Обязательные:
- `APOLLO_API_KEY` - Apollo API ключ
- `MINIO_ENDPOINT` - MinIO endpoint (порт 9000)
- `MINIO_BUCKET` - MinIO bucket name
- `MINIO_ACCESS_KEY` - MinIO access key
- `MINIO_SECRET_KEY` - MinIO secret key

### Опциональные:
- `APOLLO_ENRICH_FOR_LINKEDIN_LIMIT` - лимит enrichment (по умолчанию = target_leads)
- `DAILY_REQUEST_LIMIT` - лимит запросов в день (0 = без лимита)

## Известные ограничения

1. **Vercel Free план:** 10 секунд timeout - может не хватить для 50 лидов
2. **Vercel Pro план:** 60 секунд timeout - должно работать с текущими настройками
3. **Apollo API:** Не всегда возвращает `linkedin_url` в результатах поиска - нужен enrichment
4. **Enrichment:** Может занимать время (50ms delay между запросами)

## Последние исправления

1. ✅ Исправлены ошибки файловой системы в Vercel (сессии, job-store, token-limiter)
2. ✅ Исправлен формат Apollo фильтров (company_size с дефисом)
3. ✅ Добавлен fallback механизм (titles-only, keywords-only)
4. ✅ Enrichment всегда запускается (убрана проверка enrichLimit из условия)
5. ✅ Увеличены лимиты до 50 лидов на сегмент

## Тестирование

### Локальный тест:
```bash
node scripts/test-real-flow.mjs
```

### E2E тест:
```bash
node scripts/test-launch-outreach-real.mjs
```

### Прямой тест leadgen:
```bash
node scripts/test-leadgen-direct.mjs
```

## Статус: ✅ ВСЕ РАБОТАЕТ

- Лиды собираются ✅
- LinkedIn URLs обогащаются ✅
- CSV генерируется ✅
- JSON сохраняется в MinIO ✅
- Fallback работает ✅
