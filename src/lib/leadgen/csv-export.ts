/**
 * CSV export: build CSV string for leads (same columns as JSON).
 */

import type { Lead } from "./types";

const CSV_HEADERS = [
  "full_name",
  "title",
  "location",
  "linkedin_url",
  "company_name",
  "company_website",
  "company_industry",
  "company_employee_range",
  "source",
  "apollo_person_id",
  "confidence_score",
];

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(leads: Lead[]): string {
  const header = CSV_HEADERS.join(",");
  const rows = leads.map((lead) =>
    CSV_HEADERS.map((key) => escapeCsvCell(String((lead as unknown as Record<string, string | number>)[key] ?? ""))).join(",")
  );
  return [header, ...rows].join("\n");
}

export function getCsvFilename(jobId: string): string {
  return `leadgen_${jobId}.csv`;
}
