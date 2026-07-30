import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260728130000_v1_2_place_candidates.sql"), "utf8");

describe("V1.2 candidate lifecycle migration", () => {
  it("keeps candidates private, group-scoped, and deduplicated while pending", () => {
    expect(migration).toContain("create table public.place_candidates");
    expect(migration).toContain("where status = 'pending'");
    expect(migration).toContain("members read pending place candidates");
    expect(migration).toContain("public.is_active_group_member(group_id)");
  });

  it("provides an attested resolution path without a fabricated score", () => {
    expect(migration).toContain("create or replace function public.resolve_place_candidate");
    expect(migration).toContain("if not p_experience_attested");
    expect(migration).toContain("case when p_would_recommend then 'place_candidate.promoted' else 'place_candidate.dismissed' end");
    expect(migration).not.toContain("overall_rating");
  });

  it("does not silently re-add a privately dismissed candidate", () => {
    expect(migration).toContain("status = 'dismissed'");
    expect(migration).toContain("this place cannot be added again at this time");
  });
});
