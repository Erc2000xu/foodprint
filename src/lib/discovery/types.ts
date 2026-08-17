export type CoordinateSystem = "GCJ-02" | "WGS84" | "unknown";

export type GeoOption = {
  id: string;
  kind: "district" | "business_district" | "metro_line" | "metro_station";
  name: string;
  parentId?: string | null;
};

export type PlaceLocationStatus =
  | "ready"
  | "missing"
  | "invalid"
  | "needs_conversion";

export type BowlStrength = 1 | 2 | 3;

/**
 * The one business-level place contract shared by the list, map and sheet.
 * A few legacy display aliases remain optional while older detail components
 * are migrated; the V2.3 read model always fills the canonical fields.
 */
export type DiscoveryPlace = {
  id: string;
  name: string;
  category: string;
  address?: string;
  city?: string;
  district?: string;
  businessAreaName?: string;
  businessAreaAdcode?: string;
  latitude: number | null;
  longitude: number | null;
  coordinateSystem?: CoordinateSystem;
  locationStatus?: PlaceLocationStatus;
  cuisineSlugs?: string[];
  sceneTags: string[];
  pricePerPerson?: number | null;
  recommendedItems?: string[];
  review?: string | null;
  lastMarkedAt?: string | null;
  bowlStrength?: BowlStrength | null;
  friendCount?: number;
  recommendCount?: number;
  goodTagCounts?: Record<string, number>;
  savedForLater?: boolean;
  coverPhotoId?: string | null;
  coverPhotoWidth?: number | null;
  coverPhotoHeight?: number | null;
  coverPhotoUrl?: string | null;

  // Compatibility aliases used by V1/V2 detail and card components.
  averageRating?: number;
  markCount?: number;
  geoEntityIds?: string[];
  geoLabels?: string[];
};

export type MapDiscoveryPlace = DiscoveryPlace & {
  latitude: number;
  longitude: number;
  coordinateSystem: "GCJ-02";
  locationStatus: "ready";
};

export type LngLat = {
  longitude: number;
  latitude: number;
};

export type MapBounds = {
  southWest: LngLat;
  northEast: LngLat;
};

export type MapViewport = {
  center: LngLat;
  zoom: number;
  bounds: MapBounds;
};

export type MapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type DiscoveryIndexStatus =
  | "complete"
  | "empty"
  | "invalid_coordinates"
  | "overflow"
  | "error";

export type DiscoveryIndexResult =
  | { status: "complete"; places: MapDiscoveryPlace[] }
  | { status: "empty"; places: [] }
  | {
      status: "invalid_coordinates";
      places: DiscoveryPlace[];
      invalidCoordinateCount: number;
    }
  | {
      status: "overflow" | "error";
      places: DiscoveryPlace[];
      reason: "page_failed" | "page_empty" | "cursor_stalled" | "duplicate_id" | "safety_limit";
    };

// Foodprint currently operates on mainland China locations. This is an
// intentionally conservative coverage box, not a substitute for a provider
// polygon; it prevents an accidental foreign coordinate from becoming a map
// pin while preserving the original row for list repair.
const GCJ02_COVERAGE = {
  minLatitude: 0.8,
  maxLatitude: 55.9,
  minLongitude: 72.0,
  maxLongitude: 138.0,
} as const;

export function canonicalFriendCount(place: Pick<DiscoveryPlace, "friendCount" | "markCount">) {
  return Math.max(0, Math.round(place.friendCount ?? place.markCount ?? 0));
}

export function canonicalRecommendCount(place: Pick<DiscoveryPlace, "recommendCount" | "friendCount" | "markCount">) {
  return Math.max(0, Math.round(place.recommendCount ?? place.friendCount ?? place.markCount ?? 0));
}

export function isValidGcj02Coordinate(
  place: Pick<DiscoveryPlace, "latitude" | "longitude" | "coordinateSystem">,
): place is MapDiscoveryPlace {
  return place.coordinateSystem === "GCJ-02"
    && typeof place.latitude === "number"
    && typeof place.longitude === "number"
    && Number.isFinite(place.latitude)
    && Number.isFinite(place.longitude)
    && place.latitude >= GCJ02_COVERAGE.minLatitude
    && place.latitude <= GCJ02_COVERAGE.maxLatitude
    && place.longitude >= GCJ02_COVERAGE.minLongitude
    && place.longitude <= GCJ02_COVERAGE.maxLongitude;
}

export function withLocationStatus(place: DiscoveryPlace): DiscoveryPlace {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)
    || place.latitude === null || place.longitude === null) {
    return { ...place, locationStatus: "missing" };
  }
  if (place.coordinateSystem !== "GCJ-02") {
    return {
      ...place,
      locationStatus: place.coordinateSystem === "WGS84" ? "needs_conversion" : "invalid",
    };
  }
  if (place.latitude < GCJ02_COVERAGE.minLatitude || place.latitude > GCJ02_COVERAGE.maxLatitude
    || place.longitude < GCJ02_COVERAGE.minLongitude || place.longitude > GCJ02_COVERAGE.maxLongitude) {
    return { ...place, locationStatus: "invalid" };
  }
  return {
    ...place,
    locationStatus: "ready",
  };
}
