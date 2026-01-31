# Что отдаёт Apollo API (output)

Мы дергаем **POST** `https://api.apollo.io/api/v1/mixed_people/api_search` с фильтрами в body.

**Итоговый файл в MinIO (demo-imports):** payload в нужном формате — `product` (name, description, goal_type, goal_description) и `segments` с полями `name`, `personalization`, `leads` (массив LinkedIn URL), `leads_detail` (массив объектов: linkedin_url, full_name, title, company_name). Файл пишется в папку demo-imports (или в корень бакета, если MINIO_DEMO_PREFIX не задан).

## Ответ Apollo (сырой)

Структура ответа:

```json
{
  "people": [
    {
      "id": "apollo_person_id_123",
      "name": "John Smith",
      "first_name": "John",
      "last_name": "Smith",
      "title": "CEO",
      "city": "San Francisco",
      "state": "California",
      "country": "United States",
      "linkedin_url": "https://linkedin.com/in/johnsmith",
      "organization": {
        "name": "Acme Inc",
        "primary_domain": "acme.com",
        "industry": "Technology",
        "estimated_num_employees": 50
      }
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 100,
    "total_entries": 5000,
    "total_pages": 50
  }
}
```

Поля у человека могут быть не все (часть опциональна). Иногда приходит `first_name`/`last_name` вместо `name`.

## Во что мы это превращаем (наш output)

Каждый элемент из `people` мапится в **Lead**:

| Поле нашего output | Откуда берётся из Apollo |
|--------------------|---------------------------|
| `full_name` | `name` или `first_name` + `last_name` |
| `title` | `title` |
| `location` | `city`, `state`, `country` склеенные |
| `linkedin_url` | `linkedin_url` (или `linkedin_profile_url`, `linkedin`, `profile.linkedin_url`, `linkedin_slug`; если нет — подставляем ссылку на профиль в Apollo: `https://app.apollo.io/#/people/{id}`) |
| `company_name` | `organization.name` |
| `company_website` | `https://` + `organization.primary_domain` |
| `company_industry` | `organization.industry` |
| `company_employee_range` | из `organization.estimated_num_employees` → "1-10", "11-50", "51-200", "201-500", "500+" |
| `source` | всегда `"apollo"` |
| `apollo_person_id` | `id` |
| `confidence_score` | пока всегда `1.0` |

В базу/CSV попадают только лиды, у которых есть и `title`, и `company_name` (остальные отфильтровываются).

## Итоговый формат файла в demo-imports (MinIO)

Файл от leadgen в demo-imports имеет вид:

```json
{
  "product": {
    "name": "...",
    "description": "...",
    "goal_type": "MANUAL_GOAL",
    "goal_description": "..."
  },
  "segments": [
    {
      "name": "...",
      "personalization": "...",
      "leads": ["https://linkedin.com/in/...", ...],
      "leads_detail": [
        { "linkedin_url": "...", "full_name": "...", "title": "...", "company_name": "..." },
        ...
      ]
    }
  ]
}
```

- `leads` — массив LinkedIn URL (обязательно).
- `leads_detail` — полные данные лидов (имя, должность, компания, LinkedIn) для использования без отдельного CSV.

## Если в ответе Apollo нет LinkedIn

В `mixed_people/api_search` Apollo иногда не возвращает `linkedin_url` (зависит от тарифа/типа данных). Мы делаем:

1. **Извлечение** из всех возможных полей: `linkedin_url`, `linkedin_profile_url`, `linkedin`, `profile.linkedin_url`, `linkedin_slug` / `linkedin_id` (из слага собираем `https://www.linkedin.com/in/{slug}`).
2. **Fallback:** если ничего нет, подставляем ссылку на профиль в Apollo: `https://app.apollo.io/#/people/{id}` — по ней можно открыть контакт в Apollo (и при необходимости взять LinkedIn оттуда).

**Проверить, что реально приходит от Apollo:** открой в браузере  
`GET /api/leadgen/apollo-sample`  
В ответе будет сырой первый человек из поиска и список ключей; по ним видно, есть ли `linkedin_url` и под каким именем.

## Где это видно в коде

- Запрос к Apollo: `src/lib/leadgen/apollo-client.ts` — `searchPeople()`
- Маппинг person → Lead: `src/lib/leadgen/normalize.ts` — `normalizePerson()`, `extractLinkedInUrl()`
- Наш тип Lead: `src/lib/leadgen/types.ts` — `Lead`
