import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadDiscoveryIndexV23 } from "@/lib/discovery/server";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260813120000_v2_3_discovery_map_index.sql"), "utf8");

function row(id: string, cursor: string, hasMore: boolean) {
  return {
    group_place_id: id,
    place_name: id,
    primary_category: "restaurant",
    latitude: 39.9,
    longitude: 116.4,
    coordinate_system: "GCJ-02",
    friend_count: 1,
    recommend_count: 1,
    geo_entity_ids: ["11111111-1111-4111-8111-111111111111"],
    geo_labels: ["东城区"],
    scene_tags: [],
    cuisine_slugs: [],
    next_cursor_created_at: hasMore ? cursor : null,
    next_cursor_id: hasMore ? id : null,
    has_more: hasMore,
  };
}

describe("V2.3 complete discovery index", () => {
  it("documents the one authorized RPC, stable cursor, bounded pages and grants", () => {
    expect(migration).toContain("list_discovery_index_v2_3");
    expect(migration).toContain("get_active_group_context_v2");
    expect(migration).toContain("order by gp.created_at desc, gp.id desc");
    expect(migration).toContain("limit least(greatest(coalesce(p_limit, 100), 1), 100) + 1");
    expect(migration).toContain("revoke all on function public.list_discovery_index_v2_3");
    expect(migration).toContain("grant execute on function public.list_discovery_index_v2_3");
  });

  it("follows more than one page and rejects a stalled cursor", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const supabase = { rpc: async (_name: string, args: Record<string, unknown>) => {
      calls.push(args);
      if (calls.length === 1) return { data: [row("place-1", "2026-08-13T00:00:00.000Z", true)], error: null };
      return { data: [row("place-2", "2026-08-12T00:00:00.000Z", false)], error: null };
    } };
    const result = await loadDiscoveryIndexV23(supabase as never);
    expect(result.status).toBe("complete");
    expect(result.places.map((place) => place.id)).toEqual(["place-1", "place-2"]);
    expect(calls[1]).toMatchObject({ p_before_id: "place-1" });

    const stalled = await loadDiscoveryIndexV23({ rpc: async () => ({ data: [row("place-1", "2026-08-13T00:00:00.000Z", true)], error: null }) } as never);
    expect(stalled).toMatchObject({ status: "error", reason: "duplicate_id" });

    const overflow = await loadDiscoveryIndexV23({ rpc: async () => ({ data: [row(crypto.randomUUID(), "2026-08-13T00:00:00.000Z", true)], error: null }) } as never);
    expect(overflow).toMatchObject({ status: "overflow", reason: "safety_limit" });

    let failedPage = 0;
    const incomplete = await loadDiscoveryIndexV23({ rpc: async () => {
      failedPage += 1;
      return failedPage === 1 ? { data: [row("place-1", "2026-08-13T00:00:00.000Z", true)], error: null } : { data: null, error: new Error("rpc failed") };
    } } as never);
    expect(incomplete).toMatchObject({ status: "error", reason: "page_failed", places: [{ id: "place-1" }] });

    let emptyPage = 0;
    const empty = await loadDiscoveryIndexV23({ rpc: async () => {
      emptyPage += 1;
      return emptyPage === 1 ? { data: [row("place-1", "2026-08-13T00:00:00.000Z", true)], error: null } : { data: [], error: null };
    } } as never);
    expect(empty).toMatchObject({ status: "error", reason: "page_empty" });
  });
});
