import { describe, expect, it } from "vitest";
import { amapNavigationUrl, amapPlaceUrl } from "@/lib/amap/uri";

describe("AMap URI links", () => {
  it("builds a coordinate navigation URI without an origin", () => {
    const url = new URL(amapNavigationUrl({ name: "测试餐厅", longitude: 116.397, latitude: 39.908 }));
    expect(url.hostname).toBe("uri.amap.com");
    expect(url.pathname).toBe("/navigation");
    expect(url.searchParams.get("to")).toBe("116.397,39.908,测试餐厅");
    expect(url.searchParams.get("callnative")).toBe("1");
  });

  it("falls back to an AMap search when coordinates are absent", () => {
    const url = new URL(amapNavigationUrl({ name: "测试餐厅", address: "北京东城区" }));
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("keyword")).toContain("北京东城区");
    expect(new URL(amapPlaceUrl({ name: "测试餐厅" })).searchParams.get("view")).toBe("map");
  });
});
