# Фильтры Apollo — маппинг из Knowledge Base и наш API

Источник: [Search Filters Overview](https://knowledge.apollo.io/hc/en-us/articles/4412665755661-Search-Filters-Overview#toc_3)

## Фильтры из Apollo KB, которые мы используем

| Фильтр в Apollo UI | Параметр API (mixed_people/api_search) | Наш ICP поле |
|--------------------|----------------------------------------|--------------|
| **# of employees** | `organization_num_employees` | `company_size.employee_ranges` (формат "1,10", "11,50", "51,200") |
| **Job titles** | `person_titles` | `positions.titles_strict`, `positions.titles_broad` |
| **Location** (Contact / Account) | `person_locations`, `organization_locations` | `geo` (countries, regions, cities) |
| **Industry & keywords** | `q_organization_industry_tag_ids` (индустрии по ID), `q_keywords` (поиск по ключевым словам в описании/индустрии) | `industries`, `industry_keywords` |
| Management Level / Seniority | `person_seniorities` | `positions.seniority` |
| Departments & Job Function | (часть person_titles / departments) | `positions.departments` |

## Industry & keywords (Apollo KB)

- **Industry** — одно значение из соцсетей компании; можно фильтровать по нескольким индустриям.
- **Company keywords** — поиск по ключевым словам: можно искать по **name**, **keywords** (сайт, соцсети, Apollo AI), **company description** (SEO description, соцсети). Подходит для поиска по индустрии/описанию через ключевые слова.

Мы отправляем:
- `q_organization_industry_tag_ids` — массив (индустрии по tag ID, если есть).
- `q_keywords` — **одна строка** (Apollo API принимает string, не array). Ключевые слова через запятую для поиска по описанию/индустрии (name, keywords, company description). Мы собираем из `industry_keywords` и `industries` и отправляем как `keywords.join(", ")`.

---

## Полный глоссарий фильтров Apollo (Filter Glossary)

По [Search Filters Overview → Filter Glossary](https://knowledge.apollo.io/hc/en-us/articles/4412665755661-Search-Filters-Overview#toc_3).

### Популярные

| Фильтр | Описание |
|--------|----------|
| **# of employees** | Размер компании по числу сотрудников (диапазоны). |
| **# of employees by department** | Число сотрудников по отделам. |
| **AI filters** | Фильтры по результатам AI research. |
| **Buying intent** | Покупные интенты, темы. |
| **Company** | Конкретные компании, домен есть/нет, known/unknown. |
| **Company lookalikes** | Похожие на выбранные компании. |
| **Email status** | Verified, Unverified, Catch-all и т.д. |
| **Industry & keywords** | Индустрии + Company keywords (name, keywords, company description). |
| **Job postings** | Компании по открытым вакансиям. |
| **Job titles** | Должности, похожие титулы, исключения, Management Level, Departments. |
| **Lists** | Контакты/компании из сохранённых списков. |
| **Location** | Contact / Account: город, регион, страна, zip radius. |
| **Name** | Имя/фамилия контакта. |
| **Owner** | Владелец контакта/аккаунта. |
| **Persona** | Персоны (наборы фильтров по титулам/отделам). |
| **Scores** | Кастомные скоринговые модели. |
| **Sequence** | Участие в последовательностях. |
| **Signals** | Сигналы (демография + поведение). |
| **Stage** | Этап в пайплайне. |
| **Territories** | Территории. |

### Дополнительные (People and company filters)

Account engagement, Account or contact created date, Account or contact CSV import, Account or contact custom fields, Account or contact Salesforce view, Contact data request, Conversation recording, Conversation tracker keywords, Email auto responder, Email bounced/clicked/meeting set/opened/replied/sent/spamblocked/unsubscribed, **Founded year**, **Funding**, **Headcount growth**, **Job change**, **Languages**, Last activity, **Market segments**, **News**, Opted out of calls, Parent accounts, People lookalikes, Person deleted, **Phone status confidence**, **Retail locations**, **Revenue**, **SIC and NAICS**, Source, Synced to CRM, **Technologies**, **Time in current role**, **Total years of experience**, **Website visitors**.

Некоторые фильтры доступны только в определённых планах Apollo.
