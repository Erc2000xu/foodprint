import { describe, expect, it } from "vitest";
import { displayAmapAdministrativeLocation } from "@/lib/amap/location-display";

describe("AMap administrative location display", () => {
  it("keeps city and district as two real AMap levels", () => {
    expect(displayAmapAdministrativeLocation("北京市", "北京市顺义区")).toBe("北京市 · 顺义区");
    expect(displayAmapAdministrativeLocation("天津市", "和平区")).toBe("天津市 · 和平区");
  });

  it("does not invent a city when the upstream record does not include one", () => {
    expect(displayAmapAdministrativeLocation(undefined, "朝阳区")).toBe("朝阳区");
  });
});
