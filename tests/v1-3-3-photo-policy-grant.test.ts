import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260803110000_v1_3_3_grant_visit_record_select_for_photo_policy.sql"), "utf8");

describe("V1.3.3 photo policy privilege migration", () => {
  it("restores the SELECT privilege required by the visit-record photo policy", () => {
    expect(migration).toContain("grant select on table public.visit_records to authenticated;");
  });
});
