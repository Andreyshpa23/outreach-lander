/**
 * GET /api/leadgen/apollo-sample — один запрос к Apollo (1 человек), сырой ответ.
 * Чтобы проверить, какие поля реально приходят (есть ли linkedin_url и под каким ключом).
 */

import { NextResponse } from "next/server";
import { searchPeople } from "@/lib/leadgen/apollo-client";
import { mapIcpToApolloFilters } from "@/lib/leadgen/icp-to-apollo";
import type { Icp } from "@/lib/leadgen/types";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "APOLLO_API_KEY is not set" },
      { status: 503 }
    );
  }

  const icp: Icp = {
    geo: { countries: ["United States"] },
    positions: { titles_strict: ["CEO"] },
    industries: ["Technology"],
    company_size: { employee_ranges: ["1,10", "11,50"] },
  };
  const filters = mapIcpToApolloFilters(icp, "strict");

  try {
    const res = await searchPeople(filters, 1, 1);
    const people = res.people ?? [];
    const first = people[0];

    if (!first) {
      return NextResponse.json({
        message: "Apollo вернул 0 людей по тестовым фильтрам.",
        filters_sent: filters,
        pagination: res.pagination,
      });
    }

    const keys = Object.keys(first);
    const hasLinkedIn = "linkedin_url" in first && (first as Record<string, unknown>).linkedin_url;
    return NextResponse.json({
      message: "Первый человек из ответа Apollo (сырой объект). Проверь ключи и наличие linkedin_url.",
      first_person_keys: keys,
      has_linkedin_url: hasLinkedIn,
      linkedin_url_value: (first as Record<string, unknown>).linkedin_url ?? null,
      first_person: first,
      filters_sent: filters,
      pagination: res.pagination,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
