import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260730113000_v1_3_2_try_flow_completion.sql"), "utf8");

describe("V1.3.2 try flow completion migration", () => {
  it("does not allow a one-click recommendation to create an empty place", () => {
    expect(migration).toContain("complete a meal record before recommending this candidate");
    expect(migration).toContain("create function public.save_candidate_promotion_mark");
    expect(migration).toContain("public.record_place_visit(");
    expect(migration).toContain("public.set_group_place_cuisines(");
  });

  it("promotes matching pending candidates only after the complete mark succeeds", () => {
    expect(migration).toContain("where group_id = p_group_id and place_id = v_mark.place_id and status = 'pending'");
    expect(migration).toContain("'place_candidate.promoted'");
  });

  it("maps the deprecated street-food top-level category forward to restaurant", () => {
    expect(migration).toContain("set primary_category = 'restaurant'");
    expect(migration).toContain("check (primary_category in ('restaurant', 'cafe', 'drinks', 'bar', 'bakery_dessert', 'other_food_drink'))");
  });

  it("allows pending candidates into the shared AMap display-cache queue", () => {
    expect(migration).toContain("from public.place_candidates candidate");
    expect(migration).toContain("p_place_id uuid default null");
  });
});
