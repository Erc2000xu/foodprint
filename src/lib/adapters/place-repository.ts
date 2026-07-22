export type Coordinates = {
  latitude: number;
  longitude: number;
  coordinateSystem: "GCJ-02" | "WGS84";
};

export type PlaceSummary = {
  groupPlaceId: string;
  placeId: string;
  name: string;
  primaryCategory: string;
  coordinates: Coordinates;
  averageRating: number;
  markCount: number;
};

export type PlaceFilters = {
  city?: string[];
  primaryCategories?: string[];
  tagIds?: string[];
  minRating?: number;
  markedByUserId?: string;
};

/** All group-aware place reads and writes must pass through this boundary. */
export interface PlaceRepository {
  list(groupId: string, filters: PlaceFilters): Promise<PlaceSummary[]>;
  getByGroupPlaceId(groupPlaceId: string): Promise<PlaceSummary | null>;
  findByProviderPoi(groupId: string, provider: "amap", poiId: string): Promise<PlaceSummary | null>;
}
