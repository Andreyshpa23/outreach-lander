# Полная логика работы демо SalesTrigger от А до Я

## Обзор системы

SalesTrigger Demo — это веб-приложение для генерации LinkedIn outreach последовательностей и сбора лидов через Apollo.io API. Система работает в несколько этапов: сбор информации о продукте, генерация сообщений, сбор лидов и сохранение результатов.

---

## Архитектура и компоненты

### Frontend (React/Next.js)
- **Файл**: `src/app/page.tsx`
- Основной UI компонент с управлением состоянием через React hooks
- Отображает прогресс, чат для сбора информации, результаты генерации

### Backend API Routes
1. **`/api/collect-info`** — сбор информации о продукте через чат
2. **`/api/generate`** — генерация outreach последовательностей
3. **`/api/launch-outreach`** — запуск сбора лидов и создание файлов
4. **`/api/upload-file`** — загрузка файлов (PDF, DOCX, PPTX и т.д.)

### Внешние сервисы
- **Azure OpenAI** — для генерации текстов и анализа
- **Apollo.io API** — для поиска и обогащения лидов
- **MinIO/S3** — для хранения CSV и JSON файлов с результатами

---

## Полный flow работы (Step-by-Step)

### ШАГ 0: Инициализация и загрузка страницы

1. **Пользователь открывает страницу** (`demo.salestrigger.io`)
2. **Создается или загружается сессия**:
   - Генерируется `sessionId` (UUID)
   - Проверяются cookies: `st_user_output`, `X-Fast-Creation`, `demo_st_minio_id`
   - Если есть сохраненные данные — загружаются в состояние

3. **Инициализация состояния**:
   - `step = 0` (начальный экран)
   - Пустые массивы для сообщений, сегментов, лидов
   - Загрузка placeholder текстов для input поля

### ШАГ 1: Ввод продукта и сбор информации

#### 1.1 Пользователь вводит продукт
- Пользователь вводит описание продукта или URL в текстовое поле
- Может загрузить файлы (PDF, DOCX, PPTX, PPT, TXT) через drag-and-drop или кнопку "Attach"
- При загрузке файла:
  - Файл отправляется на `/api/upload-file`
  - Извлекается текст (для PDF/DOCX) или информация о файле
  - Добавляется к контексту запроса

#### 1.2 Запуск сбора информации
- Пользователь нажимает "Launch AI Sales Agent" или отправляет форму
- Вызывается `checkAndAskQuestions()`
- Устанавливается `step = 1` (фаза сбора информации)
- Открывается чат-интерфейс

#### 1.3 API `/api/collect-info` — анализ и вопросы

**Запрос содержит**:
```json
{
  "input": "описание продукта или URL",
  "answers": {}, // ответы на предыдущие вопросы
  "askedQuestions": [], // уже заданные вопросы
  "chatHistory": [], // история чата
  "uploadedFiles": [] // информация о загруженных файлах
}
```

**Логика работы API**:
1. **Проверка лимитов**: `checkTokenLimit()` — проверка дневного лимита запросов
2. **Построение контекста**:
   - Базовый контекст: `"Initial input: {input}"`
   - Добавляются ответы на предыдущие вопросы
   - Добавляются уже заданные вопросы (чтобы не повторять)
   - Добавляется информация о загруженных файлах

3. **Отправка в Azure OpenAI**:
   - Используется модель через Azure OpenAI API
   - Системный промпт инструктирует AI:
     - Анализировать информацию о продукте
     - Определить, достаточно ли данных для создания outreach
     - Если недостаточно — задать 2-4 конкретных вопроса
     - Фокус на: функциональность продукта, USPs, метрики, pain points
     - НЕ спрашивать про ICP/таргет аудиторию (это генерируется автоматически)

4. **Ответ AI**:
```json
{
  "has_enough_info": false,
  "questions": ["Что делает ваш продукт?", "Какие ключевые метрики?"],
  "product_name": "Название продукта"
}
```
или
```json
{
  "has_enough_info": true,
  "product_name": "Название",
  "product_summary": "Описание",
  "product_utps": ["USP1", "USP2"],
  "product_metrics": ["2-7M reach", "99.9% uptime"],
  "pain_points": ["Проблема1", "Проблема2"],
  "case_studies": ["Кейс1"]
}
```

#### 1.4 Обработка ответа на фронтенде

**Если `has_enough_info = false`**:
- Вопросы добавляются в чат с задержкой (100-150ms для эффекта печати)
- Пользователь видит вопросы в чате
- Пользователь отвечает на вопросы
- Ответы сохраняются в `answers` state
- Процесс повторяется: вызывается `collectInformation()` снова

**Если `has_enough_info = true`**:
- Извлекаются `product_utps`, `product_metrics`, `case_studies`
- Сохраняются в state: `setProductUTPs()`, `setProductMetrics()`, `setCaseStudies()`
- Переход к следующему шагу: генерация сообщений

**Защита от бесконечных вопросов**:
- Если пользователь ответил на 5+ вопросов — принудительно `has_enough_info = true`
- Если пользователь говорит "я уже все написал" — `has_enough_info = true`

### ШАГ 2: Генерация outreach последовательностей

#### 2.1 Запуск генерации
- После получения достаточной информации вызывается `startGenerationWithInput()`
- Устанавливается `step = 2` (генерация)
- Показывается прогресс-бар и анимация

#### 2.2 API `/api/generate` — генерация сообщений

**Запрос содержит**:
```json
{
  "input": "описание продукта",
  "product_utps": ["USP1", "USP2"],
  "product_metrics": ["метрика1", "метрика2"],
  "case_studies": ["кейс1"]
}
```

**Логика работы API**:
1. **Проверка лимитов**: `checkTokenLimit()`
2. **Построение промпта для AI**:
   - Системный промпт инструктирует AI как senior B2B outbound strategist
   - Требования:
     - Генерировать **ровно 2 сегмента** (разные ICP/buyer types)
     - Для каждого сегмента: 4 сообщения в последовательности
     - Тон: дружелюбный, sharing-focused, не sales pitch
     - Использовать метрики из `product_metrics` в КАЖДОМ сообщении
     - Разные метрики в разных сообщениях
     - Использовать USPs стратегически по сообщениям

3. **Генерация ICP (Ideal Customer Profile)**:
   - AI автоматически определяет `target_audience`:
     - `geo`: география (например, "United States, Canada")
     - `positions`: должности (например, ["CEO", "VP Sales"])
     - `industry`: индустрии (например, "SaaS, Technology")
     - `company_size`: размер компании в формате Apollo (например, "1-10, 11-50, 51-200")

4. **Генерация LinkedIn фильтров для Apollo**:
   - Для каждого сегмента генерируется `linkedin_filters` в строгом формате:
     ```
     "Titles: CEO, Founder, VP Sales. Keywords: SaaS, B2B, technology."
     ```
   - Формат критичен: `Titles:` и `Keywords:` обязательны
   - Эти фильтры используются позже для поиска лидов в Apollo

5. **Ответ AI**:
```json
{
  "product_name": "Product Name",
  "performance": {
    "dialogs": 150,
    "calls": 12,
    "deals": 3
  },
  "product_utps": ["USP1", "USP2"],
  "product_metrics": ["метрика1", "метрика2"],
  "target_audience": {
    "geo": "United States, Canada",
    "positions": ["CEO", "VP Sales"],
    "industry": "SaaS, Technology",
    "company_size": "1-10, 11-50, 51-200"
  },
  "segments": [
    {
      "name": "Segment 1 Name",
      "linkedin_filters": "Titles: CEO, Founder. Keywords: SaaS, B2B.",
      "personalization_ideas": "Идеи персонализации",
      "outreach_sequence": [
        "Message 1 (3-6 параграфов)",
        "Message 2",
        "Message 3",
        "Message 4"
      ]
    },
    {
      "name": "Segment 2 Name",
      "linkedin_filters": "Titles: VP Sales, Head of Sales. Keywords: enterprise, software.",
      "personalization_ideas": "Идеи персонализации",
      "outreach_sequence": [
        "Message 1",
        "Message 2",
        "Message 3",
        "Message 4"
      ]
    }
  ]
}
```

#### 2.3 Обработка результатов на фронтенде

1. **Парсинг ответа**:
   - Извлекаются сегменты, сообщения, target_audience
   - Сохраняются в `apiData` state

2. **Анимация результатов**:
   - Постепенная "печать" первого сообщения первого сегмента (`wowText`)
   - Анимация метрик (dialogs, calls, deals) с 0 до целевых значений
   - Устанавливается `step = 3` (просмотр результатов)

3. **Сохранение в сессию и cookies**:
   - Данные сохраняются в `session-storage.ts` (файл или in-memory на Vercel)
   - Сохраняются cookies:
     - `st_user_output`: полные данные генерации
     - `X-Fast-Creation`: данные для импорта в основное приложение
   - Cookie `demo_st_minio_id` пока пустой (заполнится после сбора лидов)

### ШАГ 3: Просмотр результатов и запуск сбора лидов

#### 3.1 Отображение результатов
- Показываются сегменты с сообщениями
- Показывается статистика (dialogs, calls, deals)
- Показывается target audience (ICP) — только для информации (не редактируется в UI)

#### 3.2 Запуск сбора лидов
- Пользователь нажимает "Launch outreach" (или кнопка появляется автоматически)
- Вызывается `launchOutreach()`
- Устанавливается `launchSaving = true` (показывается "Preparing...")

#### 3.3 API `/api/launch-outreach` — сбор лидов и создание файлов

**Запрос содержит**:
```json
{
  "product": {
    "name": "Product Name",
    "description": "Описание"
  },
  "segments": [
    {
      "name": "Segment 1",
      "personalization": "Идеи персонализации",
      "linkedin_filters": "Titles: CEO, Founder. Keywords: SaaS, B2B."
    },
    {
      "name": "Segment 2",
      "personalization": "Идеи персонализации",
      "linkedin_filters": "Titles: VP Sales, Head of Sales. Keywords: enterprise, software."
    }
  ],
  "target_audience": {
    "geo": "United States, Canada",
    "positions": ["CEO", "VP Sales"],
    "industry": "SaaS, Technology",
    "company_size": "1-10, 11-50, 51-200"
  }
}
```

**Логика работы API**:

1. **Валидация payload**:
   - Проверка наличия `product` и `segments`
   - Валидация через `validateDemoImportPayload()`

2. **Парсинг ICP (Ideal Customer Profile)**:
   - `targetAudienceToIcp()` — конвертирует `target_audience` в формат ICP:
     - `geo` → `IcpGeo` с `countries`
     - `positions` → `IcpPositions` с `titles_strict`
     - `industry` → `industries` (массив)
     - `company_size` → `IcpCompanySize` с `employee_ranges` (сохраняет формат с дефисом: "11-50")

3. **Парсинг LinkedIn фильтров для каждого сегмента**:
   - `linkedinFiltersToIcpAddition()` — парсит строку вида:
     ```
     "Titles: CEO, Founder. Keywords: SaaS, B2B."
     ```
   - Извлекает `titles` → `positions.titles_strict`
   - Извлекает `keywords` → `industry_keywords`
   - Для каждого сегмента создается свой `SegmentIcp` (объединение базового ICP + фильтры сегмента)

4. **Создание job для сбора лидов**:
   - Генерируется `job_id` (UUID)
   - Создается `LeadgenJobInput`:
     ```typescript
     {
       job_id: "uuid",
       icp: baseIcp, // базовый ICP из target_audience
       segment_icps: [
         { segment_index: 0, icp: segment0Icp },
         { segment_index: 1, icp: segment1Icp }
       ],
       limits: {
         target_leads: 50, // по 50 лидов на сегмент
         max_runtime_ms: 50000 // максимум 50 секунд
       },
       minio_payload: { product, segments },
       minio_key_to_update: "demo-import-{timestamp}.json"
     }
     ```
   - Job сохраняется в `job-store.ts` (in-memory на Vercel)

5. **Запуск воркера сбора лидов**:
   - Вызывается `runLeadgenWorker(job_id, input)`
   - Воркер работает синхронно (блокирует ответ API до завершения)

### ШАГ 4: Сбор лидов через Apollo.io (leadgen-worker)

#### 4.1 Логика воркера (`leadgen-worker.ts`)

**Для каждого сегмента** (если есть `segment_icps`):

1. **Поиск лидов через Apollo API**:
   - Вызывается `runSearchForIcp(segmentIcp, targetLeads, deadline)`
   - Используется progressive widening (постепенное ослабление фильтров):
     - **Step 1: strict** — все фильтры строго
     - **Step 2: relax_geo** — ослабляем географию
     - **Step 3: relax_company_size** — ослабляем размер компании
     - **Step 4: relax_industries** — ослабляем индустрии
     - **Step 5: titles_only** — только по должностям (fallback)
     - **Step 6: keywords_only** — только по ключевым словам (fallback)

2. **Запросы к Apollo API**:
   - `searchPeople(filters, page)` — поиск людей по фильтрам
   - Фильтры конвертируются через `mapIcpToApolloFilters(icp, step)`
   - Пагинация: по 100 результатов на страницу
   - Собираются до `target_leads` (50) или до истечения времени (`max_runtime_ms`)

3. **Нормализация результатов**:
   - `normalizePerson(apolloPerson)` — конвертирует Apollo Person в Lead:
     ```typescript
     {
       linkedin_url: string, // извлеченный LinkedIn URL
       apollo_person_id: string,
       name: string,
       title: string,
       company: string,
       // ... другие поля
     }
     ```
   - `isLeadValid(lead)` — проверка валидности (есть LinkedIn URL, имя и т.д.)

4. **Обогащение лидов (enrichment)**:
   - Если у лида нет `linkedin_url`:
     - Сначала пробуем `getPersonById(apollo_person_id)` — быстрый способ
     - Если не помогло — `enrichPerson(name, domain)` — медленный способ
   - Обогащение происходит параллельно с задержкой 50ms между запросами
   - Ограничено временем: `deadline - 1000ms` (резервируем 1 секунду на финальную обработку)

5. **Дедубликация**:
   - Используется `Set<string>` для отслеживания уже найденных LinkedIn URL
   - Если LinkedIn URL уже есть — лид пропускается

6. **Результат для сегмента**:
   ```typescript
   {
     linkedin_urls: string[], // массив LinkedIn URL
     leads: Lead[], // полные данные лидов
     apolloRequests: number,
     wideningStepsApplied: string[],
     partialDueToTimeout: boolean
   }
   ```

#### 4.2 Создание CSV и JSON файлов

После сбора лидов для всех сегментов:

1. **Построение CSV**:
   - `buildCsv(segmentsWithLeads)` — создает CSV файл:
     ```
     Segment,LinkedIn URL
     Segment 1,https://linkedin.com/in/person1
     Segment 1,https://linkedin.com/in/person2
     Segment 2,https://linkedin.com/in/person3
     ...
     ```

2. **Загрузка CSV в MinIO**:
   - `uploadCsv(csvContent, filename)` — загружает CSV в MinIO/S3
   - Генерируется presigned URL для скачивания: `getPresignedDownloadUrl(objectKey)`
   - URL действителен 7 дней

3. **Создание JSON payload для MinIO**:
   - Структура:
     ```json
     {
       "product": {
         "name": "Product Name",
         "description": "Описание"
       },
       "segments": [
         {
           "name": "Segment 1",
           "personalization": "Идеи персонализации",
           "leads": [
             "https://linkedin.com/in/person1",
             "https://linkedin.com/in/person2"
           ]
         },
         {
           "name": "Segment 2",
           "personalization": "Идеи персонализации",
           "leads": [
             "https://linkedin.com/in/person3"
           ]
         }
       ]
     }
     ```
   - **Важно**: В JSON только `leads` (массив LinkedIn URL), без `leads_detail`

4. **Загрузка JSON в MinIO**:
   - `uploadDemoImportToS3(payload, objectKey)` — загружает JSON
   - Object key: `demo-import-{timestamp}.json`

5. **Обновление job**:
   - Сохраняются результаты:
     ```typescript
     {
       leads_count: totalLinkedInUrls,
       download_csv_url: presignedUrl,
       minio_object_key: objectKey,
       status: "completed"
     }
     ```

#### 4.3 Возврат ответа API

```json
{
  "success": true,
  "key": "demo-import-{timestamp}.json",
  "job_id": "uuid",
  "download_csv_url": "https://minio.../presigned-url",
  "leads_count": 95
}
```

**Установка cookie**:
- `demo_st_minio_id` = `objectKey` (ID файла в MinIO)
- Cookie устанавливается для домена `.salestrigger.io` (работает на всех поддоменах)
- Срок действия: 30 дней
- `secure: true` (только HTTPS)

### ШАГ 5: Отображение результатов на фронтенде

1. **Обработка ответа**:
   - Сохраняется `download_csv_url` и `leads_count` в `launchResult` state
   - Устанавливается `launchSaving = false`

2. **Отображение**:
   - Показывается количество собранных лидов
   - Показывается ссылка для скачивания CSV (если есть)
   - Cookie `demo_st_minio_id` доступна для основного приложения `salestrigger.io`

3. **Импорт в основное приложение**:
   - Основное приложение (`app.salestrigger.io` или `outreach.salestrigger.io`) читает cookie `demo_st_minio_id`
   - Загружает JSON из MinIO по этому ID
   - Импортирует сегменты и лиды в основное приложение

---

## Детали реализации

### Управление сессиями

**Файл**: `src/lib/session-storage.ts`

- **Локально**: данные сохраняются в файлы `.sessions/{sessionId}.json`
- **На Vercel**: данные хранятся в памяти (`MEMORY_SESSIONS` Map)
- Структура сессии:
  ```typescript
  {
    sessionId: string,
    requests: Array<{
      timestamp: string,
      type: 'collect-info' | 'generate',
      input: string,
      result?: any
    }>,
    lastResult?: {
      apiData: any,
      productUTPs: string[],
      productMetrics: string[],
      targetAudience?: TargetAudience
    }
  }
  ```

### Управление job'ами

**Файл**: `src/lib/leadgen/job-store.ts`

- **Локально**: данные сохраняются в файлы `.leadgen-jobs/{jobId}.json`
- **На Vercel**: данные хранятся в памяти (`MEMORY` Map)
- Job содержит:
  - `input`: входные данные (ICP, сегменты, лимиты)
  - `leads_count`: количество собранных лидов
  - `download_csv_url`: URL для скачивания CSV
  - `minio_object_key`: ID файла в MinIO
  - `status`: "pending" | "running" | "completed" | "failed"

### Лимиты и ограничения

**Файл**: `src/lib/token-limiter.ts`

- Дневной лимит запросов: `DAILY_REQUEST_LIMIT` (env variable, по умолчанию 100)
- Трекинг использования через файл `.token-usage.json` (локально) или в памяти (Vercel)
- При превышении лимита возвращается 429 ошибка

### Apollo API интеграция

**Файл**: `src/lib/leadgen/apollo-client.ts`

- **Поиск**: `searchPeople(filters, page)` — поиск людей по фильтрам
- **Обогащение**: 
  - `getPersonById(personId)` — быстрый способ получить LinkedIn URL
  - `enrichPerson(name, domain)` — медленный способ через имя и домен компании
- **Фильтры**: конвертируются через `mapIcpToApolloFilters()` в формат Apollo API

### Progressive Widening

**Файл**: `src/lib/leadgen/icp-to-apollo.ts`

Стратегия постепенного ослабления фильтров для поиска большего количества лидов:

1. **strict**: все фильтры строго применяются
2. **relax_geo**: убираем географические ограничения
3. **relax_company_size**: убираем ограничения по размеру компании
4. **relax_industries**: убираем ограничения по индустриям
5. **titles_only**: только по должностям (fallback)
6. **keywords_only**: только по ключевым словам (fallback)

### MinIO/S3 интеграция

**Файл**: `src/lib/minio-config.ts`, `src/lib/leadgen/storage.ts`

- Используется AWS SDK для работы с MinIO (S3-совместимое хранилище)
- Конфигурация через env variables:
  - `MINIO_ENDPOINT`
  - `MINIO_BUCKET`
  - `MINIO_ACCESS_KEY`
  - `MINIO_SECRET_KEY`
- Префиксы для файлов:
  - `MINIO_DEMO_PREFIX` — для JSON файлов (по умолчанию "")
  - `MINIO_LEADGEN_CSV_PREFIX` — для CSV файлов (по умолчанию "")

---

## Обработка ошибок

### Ошибки API
- **429**: Превышен дневной лимит запросов
- **400**: Невалидные входные данные
- **500**: Ошибка сервера (логируются в консоль)
- **503**: MinIO не настроен

### Ошибки Apollo
- Если Apollo возвращает 0 результатов — применяется progressive widening
- Если все шаги widening дают 0 результатов — используются fallback запросы (titles_only, keywords_only)
- Если обогащение не находит LinkedIn URL — лид пропускается (но сохраняется в CSV если был найден)

### Таймауты
- Максимальное время работы воркера: `max_runtime_ms` (50 секунд)
- Если время истекает — возвращаются частичные результаты (`partialDueToTimeout = true`)

---

## Cookies и интеграция

### Cookies, устанавливаемые системой

1. **`st_user_output`**:
   - Полные данные генерации (сегменты, сообщения, target_audience)
   - Используется для восстановления состояния при перезагрузке страницы
   - Домен: текущий домен

2. **`X-Fast-Creation`**:
   - Данные для импорта в основное приложение SalesTrigger
   - Формат: JSON с product, segments, target_audience
   - Домен: текущий домен

3. **`demo_st_minio_id`**:
   - ID файла в MinIO (например, `demo-import-1234567890.json`)
   - Используется основным приложением для загрузки данных
   - Домен: `.salestrigger.io` (работает на всех поддоменах)
   - `secure: true` (только HTTPS)
   - Срок действия: 30 дней

### Интеграция с основным приложением

1. Пользователь завершает демо на `demo.salestrigger.io`
2. Cookie `demo_st_minio_id` устанавливается для `.salestrigger.io`
3. Пользователь переходит на `app.salestrigger.io` или `outreach.salestrigger.io`
4. Основное приложение читает cookie `demo_st_minio_id`
5. Загружает JSON из MinIO по этому ID
6. Импортирует сегменты и лиды в основное приложение

---

## Производительность и оптимизации

### Оптимизации Apollo запросов
- Пагинация: по 100 результатов на страницу
- Progressive widening: начинаем со строгих фильтров, ослабляем при необходимости
- Fallback запросы: если строгие фильтры не дают результатов

### Оптимизации обогащения
- Приоритет `getPersonById` (быстрее) перед `enrichPerson`
- Параллельная обработка с задержкой 50ms между запросами
- Ограничение по времени: резервируем 1 секунду на финальную обработку

### Оптимизации фронтенда
- Lazy loading компонентов
- Анимации через CSS transitions
- Кэширование результатов в cookies и session storage

---

## Безопасность

### Защита от злоупотреблений
- Дневной лимит запросов через `token-limiter`
- Валидация входных данных на всех этапах
- Проверка размера файлов при загрузке

### Защита данных
- Cookies с `secure: true` (только HTTPS)
- Presigned URLs для MinIO с ограниченным сроком действия (7 дней)
- Session ID генерируется на клиенте (UUID)

---

## Окружение и переменные

### Обязательные переменные окружения

**Azure OpenAI**:
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`

**Apollo.io**:
- `APOLLO_API_KEY`

**MinIO/S3**:
- `MINIO_ENDPOINT`
- `MINIO_BUCKET`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`

**Опциональные**:
- `DAILY_REQUEST_LIMIT` — дневной лимит запросов (по умолчанию 100)
- `APOLLO_ENRICH_FOR_LINKEDIN_LIMIT` — лимит обогащения (по умолчанию 100)
- `MINIO_DEMO_PREFIX` — префикс для JSON файлов
- `MINIO_LEADGEN_CSV_PREFIX` — префикс для CSV файлов

---

## Заключение

Демо SalesTrigger представляет собой комплексную систему для генерации LinkedIn outreach последовательностей и сбора лидов. Система работает в несколько этапов: сбор информации через интерактивный чат, генерация персонализированных сообщений через AI, поиск и обогащение лидов через Apollo.io, и сохранение результатов в MinIO для дальнейшего использования в основном приложении.

Ключевые особенности:
- Интерактивный сбор информации с защитой от бесконечных вопросов
- Генерация 2 сегментов с разными ICP и фильтрами
- Progressive widening для поиска максимального количества лидов
- Обогащение лидов для получения LinkedIn URL
- Интеграция через cookies для передачи данных в основное приложение
