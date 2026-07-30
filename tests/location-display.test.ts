import { describe, expect, it } from "vitest";
import { amapAdministrativeLocationParts, displayAmapAdministrativeLocation, displayAmapLocationChain } from "@/lib/amap/location-display";

describe("AMap administrative location display", () => {
  it("keeps city and district as two real AMap levels", () => {
    expect(displayAmapAdministrativeLocation("北京市", "北京市顺义区")).toBe("北京市 · 顺义区");
    expect(displayAmapAdministrativeLocation("天津市", "和平区")).toBe("天津市 · 和平区");
  });

  it("does not invent a city when the upstream record does not include one", () => {
    expect(displayAmapAdministrativeLocation(undefined, "朝阳区")).toBe("朝阳区");
  });

  it("uses the same normalized parts for cards and details", () => {
    expect(amapAdministrativeLocationParts("北京市", "北京顺义区")).toEqual(["北京市", "顺义区"]);
    expect(displayAmapLocationChain("北京市", "北京市顺义区", "后沙峪")).toBe("北京市 · 顺义区 · 后沙峪");
    expect(displayAmapLocationChain("北京市", "朝阳区", null)).toBe("北京市 · 朝阳区");
  });
});
