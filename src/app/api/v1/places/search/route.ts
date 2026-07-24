import { NextRequest, NextResponse } from "next/server";
import { cuisineOptions } from "@/lib/discovery-options";
import { filterDiscoveryPlaces, searchStateFromParams } from "@/lib/discovery/search-state";
import { getActiveDiscoveryGroup, loadDiscoveryData } from "@/lib/discovery/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const groupId = await getActiveDiscoveryGroup(supabase);
  if (!groupId) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  const state = searchStateFromParams(request.nextUrl.searchParams);
  const { places, geoOptions } = await loadDiscoveryData(supabase, groupId);
  const cards = filterDiscoveryPlaces(places, state, Object.fromEntries(cuisineOptions));
  return NextResponse.json({ total: cards.length, appliedFilters: state, places: cards, suggestions: { geo: geoOptions, cuisines: cuisineOptions } }, { headers: { "cache-control": "private, no-store" } });
}
