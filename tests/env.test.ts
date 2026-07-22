import { describe, expect, it } from "vitest";
import { readPublicEnvironment } from "../src/lib/env";

describe("readPublicEnvironment", () => {
  it("uses AMap as the safe default provider", () => {
    expect(readPublicEnvironment({}).NEXT_PUBLIC_MAP_PROVIDER).toBe("amap");
  });

  it("rejects an unknown public map provider", () => {
    expect(() => readPublicEnvironment({ NEXT_PUBLIC_MAP_PROVIDER: "other" })).toThrow();
  });
});
