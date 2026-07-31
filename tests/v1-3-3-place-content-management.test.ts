import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260731100000_v1_3_3_place_content_management.sql"), "utf8");

describe("V1.3.3 place and content management migration", () => {
  it("keeps group place archiving reversible and group-scoped", () => {
    expect(migration).toContain("add column if not exists archived_by");
    expect(migration).toContain("create or replace function public.archive_group_place");
    expect(migration).toContain("create or replace function public.restore_group_place");
    expect(migration).toContain("array['owner'::public.group_role, 'admin'::public.group_role]");
    expect(migration).toContain("status = 'inactive_no_marks'");
  });

  it("uses auditable soft candidate removal instead of deleting candidate facts", () => {
    expect(migration).toContain("resolution_type");
    expect(migration).toContain("creator_removed");
    expect(migration).toContain("manager_removed");
    expect(migration).toContain("create or replace function public.remove_place_candidate");
    expect(migration).toContain("create or replace function public.restore_place_candidate");
    expect(migration).not.toContain("delete from public.place_candidates");
  });

  it("rebuilds the author current opinion after a visit deletion and adds restore paths", () => {
    expect(migration).toContain("select * into v_snapshot from public.visit_records");
    expect(migration).toContain("delete from public.current_opinions");
    expect(migration).toContain("create or replace function public.restore_group_visit_record");
    expect(migration).toContain("create or replace function public.restore_group_photo");
    expect(migration).toContain("list_hidden_group_content");
  });
});
