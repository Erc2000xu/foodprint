import { describe, expect, it } from "vitest";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins } from "../supabase/functions/_shared/amap-reliability";

describe("AMap Edge Function origin boundary", () => {
  const allowed = parseAllowedOrigins("https://foodprint-nine.vercel.app, http://localhost:3000, https://*.vercel.app, https://foodprint-nine.vercel.app/path");

  it("keeps only complete, exact configured origins", () => {
    expect([...allowed]).toEqual(["https://foodprint-nine.vercel.app", "http://localhost:3000"]);
    expect(isAllowedOrigin("https://foodprint-nine.vercel.app", allowed)).toBe(true);
    expect(isAllowedOrigin("https://foodprint-preview.vercel.app", allowed)).toBe(false);
  });

  it("never reflects an untrusted browser Origin in CORS headers", () => {
    const trusted = corsHeaders("https://foodprint-nine.vercel.app", allowed, { methods: "POST, OPTIONS", contentType: "application/json" });
    const untrusted = corsHeaders("https://foodprint-preview.vercel.app", allowed, { methods: "POST, OPTIONS", contentType: "application/json" });
    expect(trusted).toMatchObject({ "access-control-allow-origin": "https://foodprint-nine.vercel.app" });
    expect(untrusted).not.toHaveProperty("access-control-allow-origin");
  });
});
