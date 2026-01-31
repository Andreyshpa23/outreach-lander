/**
 * Map ICP (from Cursor) to Apollo filters + progressive widening steps.
 */

import type { Icp, WideningStep } from "./types";
import type { ApolloSearchFilters } from "./apollo-client";

const WIDENING_ORDER: WideningStep[] = [
  "strict",
  "broad_titles",
  "relax_seniority",
  "relax_geo",
  "relax_company_size",
  "relax_industries",
];

function geoToLocations(icp: Icp): string[] {
  const locs: string[] = [];
  const g = icp.geo;
  if (!g) return locs;
  if (g.cities?.length) locs.push(...g.cities);
  if (g.regions?.length) locs.push(...g.regions);
  if (g.countries?.length) locs.push(...g.countries);
  return locs;
}

/**
 * Map ICP to Apollo request filters for a given widening step.
 */
/** Build q_keywords from industry_keywords + industries (keyword/description search). */
function getKeywords(icp: Icp): string[] {
  const kw = icp.industry_keywords ?? [];
  const ind = icp.industries ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...kw, ...ind]) {
    const t = String(s).trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

/** Apollo expects q_organization_industry_tag_ids to be numeric tag IDs, not names. Skip if we only have names. */
function industryTagIdsOnlyIfNumeric(industries: string[]): string[] | undefined {
  if (!industries.length) return undefined;
  const numeric = industries.filter((s) => /^\d+$/.test(String(s).trim()));
  return numeric.length ? numeric : undefined;
}

/** Apollo API expects organization_num_employees as "1-10", "11-50" (hyphen), not "1,10". */
function toApolloEmployeeRanges(ranges: string[]): string[] {
  return ranges.map((r) => {
    const s = String(r).trim();
    // Already in Apollo format (has hyphen)
    if (s.includes("-")) return s;
    // Convert comma to hyphen: "11,50" -> "11-50"
    if (s.includes(",")) {
      const converted = s.replace(",", "-");
      console.log(`[icp-to-apollo] Converted employee range "${s}" -> "${converted}"`);
      return converted;
    }
    // Keep "500+" format as-is
    if (/^\d+\+$/.test(s)) return s;
    // Single number? Try to make a range (but this is unusual)
    // Better to log and return as-is
    if (/^\d+$/.test(s)) {
      console.warn(`[icp-to-apollo] Single number employee range "${s}", keeping as-is`);
      return s;
    }
    return s;
  }).filter(Boolean);
}

export function mapIcpToApolloFilters(
  icp: Icp,
  wideningStep: WideningStep
): ApolloSearchFilters {
  const pos = icp.positions ?? {};
  const companySizeRaw = icp.company_size?.employee_ranges ?? [];
  const companySize = toApolloEmployeeRanges(companySizeRaw);
  const industries = icp.industries ?? [];
  const industryTagIds = industryTagIdsOnlyIfNumeric(industries);
  const keywords = getKeywords(icp);
  const geo = geoToLocations(icp);

  const filters: ApolloSearchFilters = {};

  switch (wideningStep) {
    case "strict": {
      if (pos.titles_strict?.length) {
        filters.person_titles = pos.titles_strict;
      }
      if (pos.seniority?.length) {
        filters.person_seniorities = pos.seniority;
      }
      if (industryTagIds?.length) {
        filters.q_organization_industry_tag_ids = industryTagIds;
      }
      if (keywords.length) {
        filters.q_keywords = keywords.join(", ");
      }
      if (companySize.length) {
        filters.organization_num_employees = companySize;
      }
      if (geo.length) {
        filters.organization_locations = geo;
        filters.person_locations = geo;
      }
      break;
    }
    case "broad_titles": {
      const titles = [...(pos.titles_strict ?? []), ...(pos.titles_broad ?? [])];
      if (titles.length) filters.person_titles = titles;
      if (pos.seniority?.length) filters.person_seniorities = pos.seniority;
      if (industryTagIds?.length) filters.q_organization_industry_tag_ids = industryTagIds;
      if (keywords.length) filters.q_keywords = keywords.join(", ");
      if (companySize.length) filters.organization_num_employees = companySize;
      if (geo.length) {
        filters.organization_locations = geo;
        filters.person_locations = geo;
      }
      break;
    }
    case "relax_seniority": {
      const titles = [...(pos.titles_strict ?? []), ...(pos.titles_broad ?? [])];
      if (titles.length) filters.person_titles = titles;
      if (industryTagIds?.length) filters.q_organization_industry_tag_ids = industryTagIds;
      if (keywords.length) filters.q_keywords = keywords.join(", ");
      if (companySize.length) filters.organization_num_employees = companySize;
      if (geo.length) {
        filters.organization_locations = geo;
        filters.person_locations = geo;
      }
      break;
    }
    case "relax_geo": {
      const titles = [...(pos.titles_strict ?? []), ...(pos.titles_broad ?? [])];
      if (titles.length) filters.person_titles = titles;
      if (industryTagIds?.length) filters.q_organization_industry_tag_ids = industryTagIds;
      if (keywords.length) filters.q_keywords = keywords.join(", ");
      if (companySize.length) filters.organization_num_employees = companySize;
      break;
    }
    case "relax_company_size": {
      const titles = [...(pos.titles_strict ?? []), ...(pos.titles_broad ?? [])];
      if (titles.length) filters.person_titles = titles;
      if (industryTagIds?.length) filters.q_organization_industry_tag_ids = industryTagIds;
      if (keywords.length) filters.q_keywords = keywords.join(", ");
      if (geo.length) {
        filters.organization_locations = geo;
        filters.person_locations = geo;
      }
      break;
    }
    case "relax_industries": {
      const titles = [...(pos.titles_strict ?? []), ...(pos.titles_broad ?? [])];
      if (titles.length) filters.person_titles = titles;
      if (keywords.length) filters.q_keywords = keywords.join(", ");
      if (companySize.length) filters.organization_num_employees = companySize;
      if (geo.length) {
        filters.organization_locations = geo;
        filters.person_locations = geo;
      }
      break;
    }
  }

  return filters;
}

export function getWideningSteps(): WideningStep[] {
  return [...WIDENING_ORDER];
}
