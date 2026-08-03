import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260803100000_v1_3_3_fix_save_candidate_place_id_ambiguity.sql"), "utf8");

describe("V1.3.3 save-mark ambiguity migration", () => {
  it("qualifies the candidate place_id inside the promotion update", () => {
    expect(migration).toContain("create or replace function public.save_candidate_promotion_mark");
    expect(migration).toContain("update public.place_candidates as candidate");
    expect(migration).toContain("candidate.place_id = v_mark.place_id");
    expect(migration).not.toContain("where group_id = p_group_id and place_id = v_mark.place_id");
  });
});
