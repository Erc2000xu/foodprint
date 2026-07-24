import { describe, expect, it } from "vitest";
import { filterDiscoveryPlaces, searchStateFromParams, searchStateToParams } from "@/lib/discovery/search-state";
import type { MapPlace } from "@/components/map/amap-map";

const places: MapPlace[] = [
  { id: "wangfujing-cantonese", name: "王府井粤菜馆", category: "restaurant", latitude: 39.9, longitude: 116.4, averageRating: 4.8, markCount: 3, recommendCount: 3, sceneTags: ["friends_gathering", "date"], cuisineSlugs: ["cantonese"], geoEntityIds: ["wangfujing", "dongcheng", "wangfujing-station"], geoLabels: ["王府井", "东城区", "王府井站"], pricePerPerson: 168, recommendedItems: ["烧鹅"], review: "适合朋友聚餐", lastMarkedAt: "2026-07-20T00:00:00Z" },
  { id: "sanlitun-coffee", name: "三里屯咖啡", category: "cafe", latitude: 39.93, longitude: 116.45, averageRating: 4.2, markCount: 1, recommendCount: 1, sceneTags: ["afternoon_tea"], cuisineSlugs: ["coffee_tea"], geoEntityIds: ["sanlitun", "chaoyang"], geoLabels: ["三里屯", "朝阳区"], pricePerPerson: null, recommendedItems: ["手冲"], review: "下午安静坐坐", lastMarkedAt: "2026-07-22T00:00:00Z" },
];
const labels = { cantonese: "粤菜", coffee_tea: "咖啡/茶饮" };

describe("V1 discovery SearchState", () => {
  it("round-trips shareable filters without a location or signed URL", () => {
    const state = searchStateFromParams(new URLSearchParams("q=%E7%8E%8B%E5%BA%9C%E4%BA%95&area=wangfujing&cuisine=cantonese&price=100_200&rating=4&sort=recent"));
    const output = searchStateToParams(state).toString();
    expect(output).toContain("area=wangfujing");
    expect(output).toContain("cuisine=cantonese");
    expect(output).not.toContain("latitude");
    expect(output).not.toContain("token");
  });

  it("combines business district, cuisine, scene, price and rating", () => {
    const state = searchStateFromParams(new URLSearchParams("area=wangfujing&cuisine=cantonese&scene=friends_gathering&price=100_200&rating=4"));
    expect(filterDiscoveryPlaces(places, state, labels).map((place) => place.id)).toEqual(["wangfujing-cantonese"]);
  });

  it("filters metro/district by structured entity IDs and handles empty results", () => {
    const station = searchStateFromParams(new URLSearchParams("area=wangfujing-station"));
    expect(filterDiscoveryPlaces(places, station, labels)).toHaveLength(1);
    const empty = searchStateFromParams(new URLSearchParams("area=does-not-exist"));
    expect(filterDiscoveryPlaces(places, empty, labels)).toEqual([]);
  });

  it("implements quick chips with selected state encoded in the URL", () => {
    const coffee = searchStateFromParams(new URLSearchParams("quick=coffee"));
    expect(filterDiscoveryPlaces(places, coffee, labels).map((place) => place.id)).toEqual(["sanlitun-coffee"]);
    expect(searchStateToParams(coffee).get("quick")).toBe("coffee");
  });
});
