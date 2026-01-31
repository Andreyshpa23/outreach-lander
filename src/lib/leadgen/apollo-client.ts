/**
 * Apollo API client: searchPeople with retry/backoff.
 * API key only on server (env APOLLO_API_KEY).
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

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
      const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify(body),
      });

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
      // Apollo may return people at top level, under data, or as contacts; иногда каждый элемент — { person: {...} }
      const raw = data.people ?? (data as { data?: { people?: ApolloPerson[] } }).data?.people ?? (data as { contacts?: ApolloPerson[] }).contacts ?? [];
      const people = (raw as (ApolloPerson & { person?: ApolloPerson })[]).map((p) => (p && typeof p === "object" && p.person ? p.person : p)) as ApolloPerson[];
      const pagination = data.pagination ?? (data as { data?: { pagination?: ApolloSearchResponse["pagination"] } }).data?.pagination;
      return { people, pagination } as ApolloSearchResponse;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }
  }

  throw lastError ?? new Error("Apollo search failed after retries");
}
