import { NextRequest, NextResponse } from "next/server";
import { cuisineOptions } from "@/lib/discovery-options";
import { filterDiscoveryPlaces, searchStateFromParams } from "@/lib/discovery/search-state";
import { getDiscoveryRequestContext, discoveryIndexToLegacyData, loadDiscoveryIndexV23 } from "@/lib/discovery/server";
import { recordServerMetric } from "@/lib/performance/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const supabase = await createClient();
  const context = await getDiscoveryRequestContext(supabase, "/api/v1/places/search");
  if (!context) return NextResponse.json({ error: "authentication_required" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  const state = searchStateFromParams(request.nextUrl.searchParams);
  const index = await loadDiscoveryIndexV23(supabase, "/api/v1/places/search");
  if (index.status === "error" || index.status === "overflow") {
    recordServerMetric("discovery.api.total", { route: "/api/v1/places/search", durationMs: performance.now() - startedAt, outcome: "error", count: 0 });
    return NextResponse.json({ error: "discovery_index_incomplete", status: index.status }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  const { places, geoOptions } = discoveryIndexToLegacyData(index);
  const cards = filterDiscoveryPlaces(places, state, Object.fromEntries(cuisineOptions));
  recordServerMetric("discovery.api.total", { route: "/api/v1/places/search", durationMs: performance.now() - startedAt, outcome: "ok", count: cards.length });
  return NextResponse.json({ total: cards.length, appliedFilters: state, places: cards, suggestions: { geo: geoOptions, cuisines: cuisineOptions } }, { headers: { "cache-control": "private, no-store", "server-timing": `discovery;dur=${Math.round(performance.now() - startedAt)}` } });
}
