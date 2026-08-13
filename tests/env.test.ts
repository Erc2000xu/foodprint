import { describe, expect, it } from "vitest";
import { readPublicEnvironment } from "../src/lib/env";
import { readDiscoveryMapRuntimeConfig } from "../src/lib/env.server";

describe("readPublicEnvironment", () => {
  it("uses AMap as the safe default provider", () => {
    expect(readPublicEnvironment({}).NEXT_PUBLIC_MAP_PROVIDER).toBe("amap");
  });

  it("rejects an unknown public map provider", () => {
    expect(() => readPublicEnvironment({ NEXT_PUBLIC_MAP_PROVIDER: "other" })).toThrow();
  });

  it("keeps the dynamic map disabled without a runtime key or explicit false flag", () => {
    expect(readDiscoveryMapRuntimeConfig({})).toEqual({ enabled: false });
    expect(readDiscoveryMapRuntimeConfig({ AMAP_JS_KEY: "js-key" })).toEqual({ enabled: true, jsApiKey: "js-key" });
    expect(readDiscoveryMapRuntimeConfig({ AMAP_JS_KEY: "js-key", DISCOVERY_DYNAMIC_MAP_ENABLED: "false" })).toEqual({ enabled: false });
  });
});
