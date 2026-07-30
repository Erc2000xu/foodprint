import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260730100000_v1_3_1_amap_business_area_cache.sql"), "utf8");

describe("V1.3.1 AMap business-area cache migration", () => {
  it("stores a refreshable provider cache instead of a Foodprint-owned directory", () => {
    expect(migration).toContain("create table public.place_amap_business_area_cache");
    expect(migration).toContain("business_area_name");
    expect(migration).toContain("adcode");
    expect(migration).toContain("next_refresh_after");
    expect(migration).toContain("temporary_failure");
    expect(migration).not.toContain("insert into public.geo_entities");
  });

  it("covers every eligible AMap group place and throttles retries", () => {
    expect(migration).toContain("place.source_provider = 'amap'");
    expect(migration).toContain("place.coordinate_system = 'GCJ-02'");
    expect(migration).toContain("cache.last_attempt_at < now() - interval '10 minutes'");
    expect(migration).toContain("limit least(greatest(coalesce(p_limit, 3), 1), 5)");
  });

  it("allows group members to read cache data without direct write access", () => {
    expect(migration).toContain("members read AMap business area cache for their places");
    expect(migration).toContain("revoke all on table public.place_amap_business_area_cache from anon, authenticated");
    expect(migration).toContain("grant select on table public.place_amap_business_area_cache to authenticated");
    expect(migration).not.toContain("grant insert on table public.place_amap_business_area_cache");
  });
});
