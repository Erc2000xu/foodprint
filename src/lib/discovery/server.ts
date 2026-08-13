import type { DiscoveryIndexResult, DiscoveryPlace, MapDiscoveryPlace } from "@/lib/discovery/types";
import { withLocationStatus, isValidGcj02Coordinate } from "@/lib/discovery/types";
import { getActiveGroupContext } from "@/lib/auth/active-group-context";
import { measureServerOperation, recordServerMetric } from "@/lib/performance/server";

type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

// V2.3 cards expose only a thumbnail identity. They must not call
// createSignedUrls from this complete index; the on-demand photo route signs
// the private thumbnail_object_key after the card enters the viewport.

const discoveryIndexPageSize = 100;
const discoveryIndexMaxPages = 20;

type DiscoveryIndexRow = Record<string, unknown>;

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function discoveryPlaceFromIndexRow(row: DiscoveryIndexRow): DiscoveryPlace {
  const latitude = nullableNumber(row.latitude);
  const longitude = nullableNumber(row.longitude);
  const coordinateSystem = row.coordinate_system === "GCJ-02" || row.coordinate_system === "WGS84"
    ? row.coordinate_system
    : "unknown";
  const friendCount = Math.max(0, Math.round(Number(row.friend_count ?? row.mark_count ?? 0)));
  const recommendCount = Math.max(0, Math.round(Number(row.recommend_count ?? friendCount)));
  const bowlValue = Number(row.bowl_strength);
  const bowlStrength = bowlValue >= 3 ? 3 : bowlValue >= 2 ? 2 : bowlValue >= 1 ? 1 : null;
  const place = withLocationStatus({
    id: String(row.group_place_id ?? ""),
    name: String(row.place_name ?? ""),
    category: String(row.primary_category ?? "other_food_drink"),
    address: nullableString(row.address) ?? undefined,
    city: nullableString(row.city) ?? undefined,
    district: nullableString(row.district) ?? undefined,
    businessAreaName: nullableString(row.business_area_name) ?? undefined,
    businessAreaAdcode: nullableString(row.business_area_adcode) ?? undefined,
    latitude,
    longitude,
    coordinateSystem,
    cuisineSlugs: stringArray(row.cuisine_slugs),
    sceneTags: stringArray(row.scene_tags),
    pricePerPerson: nullableNumber(row.price_per_person),
    recommendedItems: stringArray(row.recommended_items),
    review: nullableString(row.short_review),
    lastMarkedAt: nullableString(row.last_marked_at),
    bowlStrength,
    friendCount,
    recommendCount,
    markCount: friendCount,
    averageRating: nullableNumber(row.average_rating) ?? 0,
    goodTagCounts: {
      tasty: Math.max(0, Math.round(Number(row.tasty_count ?? 0))),
      comfortable: Math.max(0, Math.round(Number(row.comfortable_count ?? 0))),
      good_for_chat: Math.max(0, Math.round(Number(row.good_for_chat_count ?? 0))),
      good_value: Math.max(0, Math.round(Number(row.good_value_count ?? 0))),
    },
    savedForLater: Boolean(row.saved_for_later),
    coverPhotoId: nullableString(row.cover_photo_id),
    coverPhotoWidth: nullableNumber(row.cover_photo_width),
    coverPhotoHeight: nullableNumber(row.cover_photo_height),
    geoEntityIds: stringArray(row.geo_entity_ids),
    geoLabels: stringArray(row.geo_labels),
  });
  return place;
}

/**
 * Reads the complete authorized BaseSet with a stable cursor. A partial page
 * is deliberately returned as non-complete so the map cannot look complete
 * while silently omitting places.
 */
export async function loadDiscoveryIndexV23(
  supabase: SupabaseLike,
  route = "/",
): Promise<DiscoveryIndexResult> {
  const places: DiscoveryPlace[] = [];
  const ids = new Set<string>();
  let beforeCreatedAt: string | null = null;
  let beforeId: string | null = null;
  let hasMore = false;

  for (let pageNumber = 0; pageNumber < discoveryIndexMaxPages; pageNumber += 1) {
    const { data, error } = await measureServerOperation(route, "discovery.index_page", () => supabase.rpc("list_discovery_index_v2_3", {
      p_limit: discoveryIndexPageSize,
      p_before_created_at: beforeCreatedAt,
      p_before_id: beforeId,
    }));
    if (error || !Array.isArray(data)) {
      recordServerMetric("discovery.index", { route, outcome: "error", count: places.length });
      return { status: "error", places, reason: "page_failed" };
    }
    const rows = data as DiscoveryIndexRow[];
    if (rows.length > discoveryIndexPageSize) {
      recordServerMetric("discovery.index", { route, outcome: "error", count: places.length });
      return { status: "error", places, reason: "page_failed" };
    }
    if (!rows.length && hasMore) {
      recordServerMetric("discovery.index", { route, outcome: "error", count: places.length });
      return { status: "error", places, reason: "page_empty" };
    }
    for (const row of rows) {
      const place = discoveryPlaceFromIndexRow(row);
      if (!place.id || ids.has(place.id)) {
        recordServerMetric("discovery.index", { route, outcome: "error", count: places.length });
        return { status: "error", places, reason: "duplicate_id" };
      }
      ids.add(place.id);
      places.push(place);
    }

    const lastRow = rows.at(-1);
    hasMore = Boolean(lastRow?.has_more);
    if (!hasMore) break;
    const nextCreatedAt = nullableString(lastRow?.next_cursor_created_at);
    const nextId = nullableString(lastRow?.next_cursor_id);
    if (!nextCreatedAt || !nextId || (nextCreatedAt === beforeCreatedAt && nextId === beforeId)) {
      recordServerMetric("discovery.index", { route, outcome: "error", count: places.length });
      return { status: "error", places, reason: "cursor_stalled" };
    }
    beforeCreatedAt = nextCreatedAt;
    beforeId = nextId;
  }

  if (hasMore) {
    recordServerMetric("discovery.index", { route, outcome: "error", count: places.length });
    return { status: "overflow", places, reason: "safety_limit" };
  }

  if (!places.length) {
    recordServerMetric("discovery.index", { route, outcome: "empty", count: 0 });
    return { status: "empty", places: [] };
  }
  const invalidCoordinateCount = places.filter((place) => !isValidGcj02Coordinate(place)).length;
  if (invalidCoordinateCount > 0) {
    recordServerMetric("discovery.index_invalid_coordinates", { route, outcome: "error", count: invalidCoordinateCount });
    return { status: "invalid_coordinates", places, invalidCoordinateCount };
  }
  const mapPlaces = places as MapDiscoveryPlace[];
  recordServerMetric("discovery.index", { route, outcome: "ok", count: mapPlaces.length });
  return { status: "complete", places: mapPlaces };
}

export function discoveryIndexToLegacyData(index: DiscoveryIndexResult) {
  return { places: index.places, geoOptions: [] };
}

/** Reads the authenticated user and active membership exactly once per request. */
export async function getDiscoveryRequestContext(supabase: SupabaseLike, route = "/") {
  return getActiveGroupContext(supabase, route);
}
