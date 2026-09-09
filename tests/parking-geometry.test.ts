import { describe, expect, it } from "vitest";
import {
  formatParkingLength,
  normalizeParkingGeometry,
  parkingLengthMeters,
} from "@/lib/parking/geometry";

describe("motorcycle parking geometry", () => {
  it("accepts a point and calculates the expected order of magnitude for short road segments", () => {
    const point = normalizeParkingGeometry("point", [116.397428, 39.90923]);
    expect(point).toEqual({ ok: true, coordinates: [116.397428, 39.90923] });

    const roughly50m = normalizeParkingGeometry("line", [
      [116.4, 39.9],
      [116.40055, 39.9],
    ]);
    const roughly100m = normalizeParkingGeometry("line", [
      [116.4, 39.9],
      [116.4011, 39.9],
    ]);
    expect(roughly50m.ok).toBe(true);
    expect(roughly100m.ok).toBe(true);
    if (roughly50m.ok && roughly100m.ok) {
      expect(parkingLengthMeters("line", roughly50m.coordinates)).toBeGreaterThan(40);
      expect(parkingLengthMeters("line", roughly50m.coordinates)).toBeLessThan(60);
      expect(parkingLengthMeters("line", roughly100m.coordinates)).toBeGreaterThan(80);
      expect(parkingLengthMeters("line", roughly100m.coordinates)).toBeLessThan(110);
      expect(formatParkingLength(parkingLengthMeters("line", roughly100m.coordinates))).toMatch(/约/);
    }
  });

  it("keeps bent lines in order and auto-closes areas", () => {
    const bentLine = normalizeParkingGeometry("line", [
      [116.4, 39.9],
      [116.4005, 39.9005],
      [116.401, 39.9],
    ]);
    expect(bentLine.ok).toBe(true);

    const area = normalizeParkingGeometry("area", [
      [116.4, 39.9],
      [116.401, 39.9],
      [116.401, 39.901],
      [116.4, 39.901],
    ]);
    expect(area).toEqual({
      ok: true,
      coordinates: [
        [116.4, 39.9],
        [116.401, 39.9],
        [116.401, 39.901],
        [116.4, 39.901],
        [116.4, 39.9],
      ],
    });
  });

  it("rejects invalid, duplicate, self-intersecting, and zero-area geometry", () => {
    expect(normalizeParkingGeometry("point", [181, 39.9]).ok).toBe(false);
    expect(normalizeParkingGeometry("line", [[116.4, 39.9]]).ok).toBe(false);
    expect(normalizeParkingGeometry("line", [
      [116.4, 39.9],
      [116.401, 39.901],
      [116.4, 39.9],
    ]).ok).toBe(false);
    expect(normalizeParkingGeometry("line", [
      [116.4, 39.9],
      [116.401, 39.901],
      [116.4, 39.901],
      [116.401, 39.9],
    ]).ok).toBe(false);
    expect(normalizeParkingGeometry("area", [
      [116.4, 39.9],
      [116.401, 39.9],
      [116.402, 39.9],
    ]).ok).toBe(false);
  });
});
