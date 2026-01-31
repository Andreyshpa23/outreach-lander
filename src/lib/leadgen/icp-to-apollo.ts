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
export function mapIcpToApolloFilters(
  icp: Icp,
  wideningStep: WideningStep
): ApolloSearchFilters {
  const pos = icp.positions ?? {};
  const companySize = icp.company_size?.employee_ranges ?? [];
  const industries = icp.industries ?? [];
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
      // Don't filter by seniority
      if (industries.length) filters.q_organization_industry_tag_ids = industries;
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
      if (companySize.length) filters.organization_num_employees = companySize;
      // No geo filter
      break;
    }
    case "relax_company_size": {
      const titles = [...(pos.titles_strict ?? []), ...(pos.titles_broad ?? [])];
      if (titles.length) filters.person_titles = titles;
      if (industries.length) filters.q_organization_industry_tag_ids = industries;
      // No company size filter
      if (geo.length) {
        filters.organization_locations = geo;
        filters.person_locations = geo;
      }
      break;
    }
    case "relax_industries": {
      const titles = [...(pos.titles_strict ?? []), ...(pos.titles_broad ?? [])];
      if (titles.length) filters.person_titles = titles;
      if (companySize.length) filters.organization_num_employees = companySize;
      if (geo.length) {
        filters.organization_locations = geo;
        filters.person_locations = geo;
      }
      // No industry filter
      break;
    }
  }

  return filters;
}

export function getWideningSteps(): WideningStep[] {
  return [...WIDENING_ORDER];
}
