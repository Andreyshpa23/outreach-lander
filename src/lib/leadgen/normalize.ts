/**
 * Normalize Apollo person to Lead; quality check (title + company_name required).
 * LinkedIn URL берём из всех возможных полей ответа Apollo; если нет — fallback на профиль в Apollo (app.apollo.io/#/people/{id}).
 */

import type { Lead } from "./types";
import type { ApolloPerson } from "./apollo-client";

function extractLinkedInUrl(person: ApolloPerson & Record<string, unknown>): string {
  const raw = person as Record<string, unknown>;
  const v =
    person.linkedin_url
    ?? raw.linkedin_profile_url
    ?? raw.linkedin
    ?? raw.linkedin_url
    ?? (typeof raw.profile === "object" && raw.profile !== null
      ? String((raw.profile as Record<string, unknown>).linkedin_url ?? "").trim()
      : "");
  let s = String(v ?? "").trim();
  if (s) {
    if (!s.startsWith("http")) s = s.startsWith("linkedin.com") ? `https://${s}` : `https://www.linkedin.com/in/${s.replace(/^\/+/, "")}`;
    return s;
  }
  const slug = raw.linkedin_slug ?? raw.linkedin_id;
  if (slug && typeof slug === "string" && slug.trim()) {
    const clean = slug.trim().replace(/^\/+/, "");
    return clean ? `https://www.linkedin.com/in/${clean}` : "";
  }
  const id = person.id;
  if (id && typeof id === "string" && id.trim()) {
    return `https://app.apollo.io/#/people/${encodeURIComponent(id.trim())}`;
  }
  return "";
}

export function normalizePerson(person: ApolloPerson): Lead {
  const org = person.organization ?? {};
  const locParts = [person.city, person.state, person.country].filter(Boolean);
  const location = locParts.join(", ");
  const emp = org.estimated_num_employees;
  const company_employee_range =
    emp != null
      ? emp <= 10
        ? "1-10"
        : emp <= 50
          ? "11-50"
          : emp <= 200
            ? "51-200"
            : emp <= 500
              ? "201-500"
              : "500+"
      : "";

  const fullName =
    person.name?.trim() ||
    [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
    "";
  return {
    full_name: fullName,
    title: String(person.title ?? "").trim(),
    location: location.trim(),
    linkedin_url: extractLinkedInUrl(person as ApolloPerson & Record<string, unknown>),
    company_name: String(org.name ?? "").trim(),
    company_website: org.primary_domain ? `https://${String(org.primary_domain).replace(/^https?:\/\//, "")}` : "",
    company_industry: String(org.industry ?? "").trim(),
    company_employee_range,
    source: "apollo",
    apollo_person_id: String(person.id ?? "").trim(),
    confidence_score: 1.0,
  };
}

export function isLeadValid(lead: Lead): boolean {
  return !!(lead.title && lead.company_name);
}
