import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatMapClusterCount,
  MAP_CLUSTER_ASSETS,
  MAP_PIN_ASSETS,
  MAP_PIN_METRICS,
  MAP_USER_LOCATION_ASSET,
  mapPinAssetSource,
  toMapPinRecommendationLevel,
} from "@/lib/amap/map-pin-assets";
import {
  createMapClusterElement,
  createMapPinElement,
  createMapUserLocationElement,
  mapClusterCountPosition,
  mapPinPixelOffset,
} from "@/lib/amap/map-pin-elements";

const projectRoot = process.cwd();

function publicAssetExists(source: string) {
  return fs.existsSync(path.join(projectRoot, "public", source.replace(/^\//, "")));
}

describe("V2.3 formal map pin asset system", () => {
  it("provides default and selected SVGs for every recommendation level", () => {
    for (const level of [1, 2, 3] as const) {
      for (const state of ["default", "selected"] as const) {
        const source = mapPinAssetSource(level, state);
        expect(source).toBe(MAP_PIN_ASSETS[level][state]);
        expect(source.endsWith(".svg")).toBe(true);
        expect(publicAssetExists(source)).toBe(true);
      }
    }
  });

  it("keeps cluster artwork local and formats dense counts consistently", () => {
    expect(publicAssetExists(MAP_CLUSTER_ASSETS.default)).toBe(true);
    expect(publicAssetExists(MAP_CLUSTER_ASSETS.active)).toBe(true);
    expect(publicAssetExists(MAP_USER_LOCATION_ASSET)).toBe(true);
    expect(formatMapClusterCount(1)).toBe("1");
    expect(formatMapClusterCount(12)).toBe("12");
    expect(formatMapClusterCount(99)).toBe("99");
    expect(formatMapClusterCount(100)).toBe("100+");
    expect(formatMapClusterCount(Number.NaN)).toBe("1");
  });

  it("normalizes legacy recommendation values into the three approved levels", () => {
    expect(toMapPinRecommendationLevel(null)).toBe(1);
    expect(toMapPinRecommendationLevel(1)).toBe(1);
    expect(toMapPinRecommendationLevel(2)).toBe(2);
    expect(toMapPinRecommendationLevel(3)).toBe(3);
    expect(toMapPinRecommendationLevel(9)).toBe(3);
  });

  it("uses the approved render sizes and exact source anchor", () => {
    expect(MAP_PIN_METRICS.default).toEqual({ width: 40, height: 45 });
    expect(MAP_PIN_METRICS.selected).toEqual({ width: 48, height: 54 });
    expect(MAP_PIN_METRICS.minimumHitTarget).toBe(44);
    expect(mapPinPixelOffset(40, 45)).toEqual({ x: -20, y: -45 });
    expect(mapPinPixelOffset(48, 54)).toEqual({ x: -24, y: -54 });
    expect(mapClusterCountPosition(44, 50)).toEqual({
      x: 24,
      y: 24.833333333333336,
    });
    expect(mapClusterCountPosition(48, 54)).toEqual({ x: 24, y: 22.5 });
  });

  it("creates accessible single and cluster marker DOM", () => {
    const pin = createMapPinElement({
      level: 3,
      selected: true,
      accessibleLabel: "河畔小馆，会专门去，已选中",
    });
    expect(pin.tagName).toBe("BUTTON");
    expect(pin.dataset.level).toBe("3");
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(pin.querySelector("img")?.getAttribute("src")).toBe(
      "/icons/map-pins/pin-level-3-selected.svg",
    );

    const cluster = createMapClusterElement({ count: 120 });
    expect(cluster.getAttribute("aria-label")).toContain("120 家");
    expect(cluster.dataset.density).toBe("compact");
    expect(cluster.style.getPropertyValue("--foodprint-cluster-count-x")).toBe(
      "24px",
    );
    expect(cluster.style.getPropertyValue("--foodprint-cluster-count-y")).toBe(
      "24.833333333333336px",
    );
    expect(cluster.querySelector("span")?.textContent).toBe("100+");

    const userLocation = createMapUserLocationElement();
    expect(userLocation.getAttribute("role")).toBe("img");
    expect(userLocation.getAttribute("aria-label")).toBe("你的当前位置");
    expect(userLocation.querySelector("img")?.getAttribute("src")).toBe(
      "/icons/map-pins/user-location.svg",
    );
  });
});
