import { describe, expect, it } from "vitest";
import { isValidGcj02Coordinate, withLocationStatus, type DiscoveryPlace } from "@/lib/discovery/types";
import { placesWithinBounds } from "@/lib/discovery/viewport";

const place = (id: string, longitude: number, latitude: number, coordinateSystem: DiscoveryPlace["coordinateSystem"] = "GCJ-02"): DiscoveryPlace => ({
  id,
  name: id,
  category: "restaurant",
  longitude,
  latitude,
  coordinateSystem,
  sceneTags: [],
});

describe("V2.3 coordinate and viewport boundaries", () => {
  it("rejects WGS84, missing and out-of-range coordinates for the map", () => {
    expect(isValidGcj02Coordinate(place("gcj", 116.4, 39.9))).toBe(true);
    expect(isValidGcj02Coordinate(place("wgs", 116.4, 39.9, "WGS84"))).toBe(false);
    expect(withLocationStatus(place("wgs", 116.4, 39.9, "WGS84")).locationStatus).toBe("needs_conversion");
    expect(withLocationStatus(place("missing", Number.NaN, 39.9)).locationStatus).toBe("missing");
    expect(withLocationStatus(place("invalid", 200, 39.9)).locationStatus).toBe("invalid");
    expect(isValidGcj02Coordinate(place("outside-mainland", 10, 39.9))).toBe(false);
    expect(withLocationStatus(place("outside-mainland", 10, 39.9)).locationStatus).toBe("invalid");
  });

  it("supports normal and dateline-crossing viewport bounds while excluding non-map places", () => {
    const places = [place("inside", 116.4, 39.9), place("outside", 117.4, 39.9), place("wgs", 116.4, 39.9, "WGS84")];
    expect(placesWithinBounds(places, { southWest: { longitude: 116, latitude: 39 }, northEast: { longitude: 117, latitude: 40 } }).map((item) => item.id)).toEqual(["inside"]);
    expect(placesWithinBounds(places, { southWest: { longitude: 179, latitude: 0 }, northEast: { longitude: -179, latitude: 20 } })).toEqual([]);
  });
});
