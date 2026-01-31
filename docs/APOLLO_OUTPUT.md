# Что отдаёт Apollo API (output)

Мы дергаем **POST** `https://api.apollo.io/api/v1/mixed_people/api_search` с фильтрами в body.

**В MinIO сохраняем только LinkedIn URL:** из каждого человека берётся только `linkedin_url`; в MinIO пишется payload в формате product + segments, где `segments[].leads` = массив этих URL (строки). Остальные поля Apollo (name, title, company и т.д.) в MinIO не кладутся.

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
| `linkedin_url` | `linkedin_url` |
| `company_name` | `organization.name` |
| `company_website` | `https://` + `organization.primary_domain` |
| `company_industry` | `organization.industry` |
| `company_employee_range` | из `organization.estimated_num_employees` → "1-10", "11-50", "51-200", "201-500", "500+" |
| `source` | всегда `"apollo"` |
| `apollo_person_id` | `id` |
| `confidence_score` | пока всегда `1.0` |

В базу/CSV попадают только лиды, у которых есть и `title`, и `company_name` (остальные отфильтровываются).

## Где это видно в коде

- Запрос к Apollo: `src/lib/leadgen/apollo-client.ts` — `searchPeople()`
- Маппинг person → Lead: `src/lib/leadgen/normalize.ts` — `normalizePerson()`
- Наш тип Lead: `src/lib/leadgen/types.ts` — `Lead`
