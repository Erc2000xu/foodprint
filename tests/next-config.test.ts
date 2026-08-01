import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Next request limits", () => {
  it("allows the compressed photo payload used by the mark form", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("16mb");
  });
});
