/**
 * Normalize Apollo person to Lead; quality check (title + company_name required).
 */

import type { Lead } from "./types";
import type { ApolloPerson } from "./apollo-client";

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

  return {
    full_name: String(person.name ?? "").trim(),
    title: String(person.title ?? "").trim(),
    location: location.trim(),
    linkedin_url: String(person.linkedin_url ?? "").trim(),
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
