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

export function mapIcpToApolloFilters(
  icp: Icp,
  wideningStep: WideningStep
): ApolloSearchFilters {
  const pos = icp.positions ?? {};
  const companySize = icp.company_size?.employee_ranges ?? [];
  const industries = icp.industries ?? [];
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
      if (industries.length) {
        filters.q_organization_industry_tag_ids = industries;
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
      if (industries.length) filters.q_organization_industry_tag_ids = industries;
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
      if (industries.length) filters.q_organization_industry_tag_ids = industries;
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
      if (industries.length) filters.q_organization_industry_tag_ids = industries;
      if (keywords.length) filters.q_keywords = keywords.join(", ");
      if (companySize.length) filters.organization_num_employees = companySize;
      break;
    }
    case "relax_company_size": {
      const titles = [...(pos.titles_strict ?? []), ...(pos.titles_broad ?? [])];
      if (titles.length) filters.person_titles = titles;
      if (industries.length) filters.q_organization_industry_tag_ids = industries;
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
