import { describe, expect, it } from "vitest";
import { buildMapCoordinateBuckets, createMapPinData, readMapPlaceReference, resolveMapPlaceIndex } from "@/lib/amap/map-pin-mapping";
import type { MapDiscoveryPlace } from "@/lib/discovery/types";

const places: MapDiscoveryPlace[] = [
  { id: "place-1", name: "一号店", category: "restaurant", latitude: 39.9, longitude: 116.4, coordinateSystem: "GCJ-02", locationStatus: "ready", sceneTags: [], bowlStrength: 1 },
  { id: "place-2", name: "二号店", category: "restaurant", latitude: 39.9, longitude: 116.4, coordinateSystem: "GCJ-02", locationStatus: "ready", sceneTags: [], bowlStrength: 2 },
  { id: "place-3", name: "三号店", category: "cafe", latitude: 39.91, longitude: 116.41, coordinateSystem: "GCJ-02", locationStatus: "ready", sceneTags: [], bowlStrength: 3 },
];

describe("V2.4 map business reference mapping", () => {
  it("writes stable place ID and index fields into every cluster datum", () => {
    expect(createMapPinData(places)).toEqual(expect.arrayContaining([
      expect.objectContaining({ placeIndex: 0, placeId: "place-1", extData: { placeIndex: 0, placeId: "place-1" } }),
      expect.objectContaining({ placeIndex: 2, placeId: "place-3" }),
    ]));
  });

  it("reads documented and nested callback references", () => {
    expect(readMapPlaceReference({ placeId: "place-1" })).toEqual({ placeId: "place-1", placeIndex: undefined });
    expect(readMapPlaceReference({ data: { extData: { placeIndex: 2 } } })).toEqual({ placeId: undefined, placeIndex: 2 });
  });

  it("resolves unique coordinates but refuses ambiguous duplicate coordinates without a business reference", () => {
    const buckets = buildMapCoordinateBuckets(places);
    expect(resolveMapPlaceIndex({ placeId: "place-2" }, places, buckets, { longitude: 116.4, latitude: 39.9 })).toBe(1);
    expect(resolveMapPlaceIndex({}, places, buckets, { longitude: 116.4, latitude: 39.9 })).toBeNull();
    expect(resolveMapPlaceIndex({}, places, buckets, { longitude: 116.41, latitude: 39.91 })).toBe(2);
  });
});
