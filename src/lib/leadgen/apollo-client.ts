/**
 * Apollo API client: searchPeople with retry/backoff.
 * API key only on server (env APOLLO_API_KEY).
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;

export interface ApolloSearchFilters {
  person_titles?: string[];
  person_locations?: string[];
  organization_locations?: string[];
  person_seniorities?: string[];
  organization_num_employees?: string[];
  q_organization_industry_tag_ids?: string[];
  /** Company keywords: one string (Apollo API expects string, not array). */
  q_keywords?: string;
  [key: string]: unknown;
}

export interface ApolloPerson {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  organization?: {
    name?: string;
    primary_domain?: string;
    industry?: string;
    estimated_num_employees?: number;
  };
  [key: string]: unknown;
}

export interface ApolloSearchResponse {
  people?: ApolloPerson[];
  pagination?: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
  [key: string]: unknown;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function searchPeople(
  filters: ApolloSearchFilters,
  page: number = 1,
  perPage: number = 100
): Promise<ApolloSearchResponse> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error("APOLLO_API_KEY is not set");
  }

  // Apollo: api_key in body + non-empty filter arrays and strings (e.g. q_keywords is string)
  const cleanFilters: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (Array.isArray(v) && v.length > 0) (cleanFilters as Record<string, unknown>)[k] = v;
    else if (typeof v === "string" && v.trim()) (cleanFilters as Record<string, unknown>)[k] = v.trim();
  }
  const body: Record<string, unknown> = {
    api_key: apiKey,
    page,
    per_page: perPage,
    ...cleanFilters,
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const elapsed = Date.now() - start;

      if (res.status === 429 || res.status >= 500) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        lastError = new Error(`Apollo ${res.status}, retry in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Apollo API error ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as ApolloSearchResponse & { people?: ApolloPerson[]; data?: { people?: ApolloPerson[] }; contacts?: ApolloPerson[] };
      // Apollo may return people at top level, under data, or as contacts; иногда каждый элемент — { person: {...} } и linkedin_url на верхнем уровне
      const raw = data.people ?? (data as { data?: { people?: ApolloPerson[] } }).data?.people ?? (data as { contacts?: ApolloPerson[] }).contacts ?? [];
      if (page === 1 && raw.length > 0) {
        console.log("[apollo] filters sent:", JSON.stringify(cleanFilters).slice(0, 300));
        const firstPerson = raw[0] as Record<string, unknown>;
        const linkedinKeys = ["linkedin_url", "linkedin_profile_url", "linkedin", "linkedin_slug", "linkedin_id"];
        const hasLinkedIn = linkedinKeys.some(k => firstPerson[k] != null && String(firstPerson[k]).trim() !== "");
        console.log("[apollo] first person has linkedin_url:", hasLinkedIn, "keys:", Object.keys(firstPerson).filter(k => k.toLowerCase().includes("linkedin")).join(","));
      }
      const LINKEDIN_KEYS = ["linkedin_url", "linkedin_profile_url", "linkedin", "linkedin_slug", "linkedin_id"];
      const people = (raw as (ApolloPerson & { person?: ApolloPerson })[]).map((p) => {
        const inner = p && typeof p === "object" && p.person ? p.person : p;
        const top = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
        const merged = { ...inner } as Record<string, unknown>;
        for (const k of LINKEDIN_KEYS) {
          const v = top[k];
          if (v != null && typeof v === "string" && v.trim() && (!merged[k] || !String(merged[k]).trim()))
            merged[k] = v.trim();
        }
        return merged as ApolloPerson;
      });
      const pagination = data.pagination ?? (data as { data?: { pagination?: ApolloSearchResponse["pagination"] } }).data?.pagination;
      console.log("[apollo] page=" + page + " status=" + res.status + " people=" + people.length + " elapsed_ms=" + elapsed + " total_pages=" + (pagination?.total_pages ?? "?"));
      if (people.length > 0) {
        const first = people[0] as Record<string, unknown>;
        const linkedinKeys = ["linkedin_url", "linkedin_profile_url", "linkedin", "linkedin_slug", "linkedin_id"];
        const found = linkedinKeys.filter((k) => first[k] != null && String(first[k]).trim() !== "");
        if (found.length) console.log("[apollo] first person linkedin fields:", found.map((k) => `${k}=${String(first[k]).slice(0, 60)}`).join(" "));
        else console.log("[apollo] first person has no linkedin fields; keys:", Object.keys(first).join(","));
      }
      return { people, pagination } as ApolloSearchResponse;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.log("[apollo] attempt=" + (attempt + 1) + " error=" + (lastError?.message ?? String(e)));
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }
  }

  throw lastError ?? new Error("Apollo search failed after retries");
}

/** Из ответа Apollo (person) достаём только LinkedIn URL (linkedin.com, не apollo). */
function linkedInFromPerson(person: Record<string, unknown> | null | undefined): string | null {
  if (!person || typeof person !== "object") return null;
  const url = (person.linkedin_url ?? person.linkedin_profile_url ?? person.linkedin) as string | undefined;
  const u = String(url ?? "").trim();
  if (u && u.includes("linkedin.com") && !/apollo/i.test(u)) return u;
  const slug = (person.linkedin_slug ?? person.linkedin_id) as string | undefined;
  const slugStr = typeof slug === "string" ? slug.trim() : "";
  if (slugStr) return `https://www.linkedin.com/in/${slugStr.replace(/^\/+/, "")}`;
  return null;
}

/**
 * Получить персону по Apollo id (GET /people/{id}). В поиске Apollo часто нет linkedin_url — по id возвращается полный профиль.
 */
export async function getPersonById(personId: string): Promise<{ linkedin_url?: string } | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || !personId?.trim()) return null;
  const id = personId.trim();
  try {
    const url = `${APOLLO_BASE}/people/${encodeURIComponent(id)}?api_key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: "GET",
      headers: { "Cache-Control": "no-cache", "X-Api-Key": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      if (res.status === 404) return null;
      console.warn("[apollo] getPersonById not ok:", res.status, id);
      return null;
    }
    const data = (await res.json()) as { person?: Record<string, unknown> };
    const person = data.person;
    const linkedin = linkedInFromPerson(person);
    if (linkedin) return { linkedin_url: linkedin };
    return null;
  } catch (e) {
    console.warn("[apollo] getPersonById error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * People Enrichment — один человек по first_name, last_name, domain (или по id через getPersonById).
 * Тратит кредиты Apollo. Возвращает linkedin_url если есть.
 */
export async function enrichPerson(params: {
  first_name: string;
  last_name: string;
  domain?: string;
  person_id?: string;
}): Promise<{ linkedin_url?: string } | null> {
  if (params.person_id?.trim()) {
    const byId = await getPersonById(params.person_id.trim());
    if (byId?.linkedin_url) return byId;
  }
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;
  const body: Record<string, string> = {
    api_key: apiKey,
    first_name: (params.first_name ?? "").trim(),
    last_name: (params.last_name ?? "").trim(),
  };
  if (params.domain?.trim()) body.domain = params.domain.trim();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.warn("[apollo] enrich person not ok:", res.status, params.first_name, params.last_name);
      return null;
    }
    const data = (await res.json()) as { person?: Record<string, unknown> };
    const linkedin = linkedInFromPerson(data.person);
    if (linkedin) return { linkedin_url: linkedin };
    return null;
  } catch (e) {
    console.warn("[apollo] enrich person error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
