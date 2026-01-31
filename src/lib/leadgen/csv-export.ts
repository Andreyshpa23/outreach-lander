/**
 * CSV export: build CSV string for leads (same columns as JSON).
 * В колонке linkedin_url — только реальные URL LinkedIn (без apollo).
 */

import type { Lead } from "./types";
import { onlyLinkedInUrl } from "./normalize";

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
  const rows = leads.map((lead) => {
    const row = lead as unknown as Record<string, string | number>;
    return CSV_HEADERS.map((key) => {
      const v = key === "linkedin_url" ? onlyLinkedInUrl(row.linkedin_url as string) : (row[key] ?? "");
      return escapeCsvCell(String(v));
    }).join(",");
  });
  return [header, ...rows].join("\n");
}

export function getCsvFilename(jobId: string): string {
  return `leadgen_${jobId}.csv`;
}
