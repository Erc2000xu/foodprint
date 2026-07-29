import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const privacyMigration = readFileSync(new URL("../supabase/migrations/20260729140000_v1_3_owner_only_member_directory.sql", import.meta.url), "utf8");
const visitsMigration = readFileSync(new URL("../supabase/migrations/20260729141000_v1_3_visit_records.sql", import.meta.url), "utf8");

describe("V1.3 privacy and visit migrations", () => {
  it("limits the email-bearing member directory to Owners", () => {
    expect(privacyMigration).toContain("array['owner'::public.group_role]");
    expect(privacyMigration).not.toContain("array['owner'::public.group_role, 'admin'::public.group_role]");
  });

  it("keeps retained opinions separate from anonymous presentation", () => {
    expect(visitsMigration).toContain("create table public.current_opinions");
    expect(visitsMigration).toContain("create table public.visit_records");
    expect(visitsMigration).toContain("is_anonymous boolean not null default false");
    expect(visitsMigration).toContain("when member.status <> 'active' then '已离开成员'");
    expect(visitsMigration).toContain("when visit.is_anonymous then '匿名成员'");
  });

  it("does not grant direct reads of author identifiers in new visit tables", () => {
    expect(visitsMigration).toContain("revoke all on table public.opinion_tags, public.current_opinions, public.visit_records from anon, authenticated");
    expect(visitsMigration).not.toContain("grant select on table public.opinion_tags, public.current_opinions, public.visit_records to authenticated");
  });

  it("keeps deletion and moderation behind audited database functions", () => {
    expect(visitsMigration).toContain("create or replace function public.delete_my_visit_record");
    expect(visitsMigration).toContain("create or replace function public.hide_group_visit_record");
    expect(visitsMigration).toContain("create or replace function public.hide_group_photo");
    expect(visitsMigration).toContain("'visit_record.hidden'");
    expect(visitsMigration).toContain("'photo.hidden'");
  });

  it("lets non-Owners leave without erasing their retained contributions", () => {
    expect(visitsMigration).toContain("create or replace function public.leave_active_group");
    expect(visitsMigration).toContain("set status = 'removed', removed_at = now()");
    expect(visitsMigration).toContain("'group_member.left'");
  });

  it("keeps personal V1.3 exports scoped to the requesting author", () => {
    expect(visitsMigration).toContain("create or replace function public.export_my_v1_3_records");
    expect(visitsMigration).toContain("opinion.user_id = auth.uid()");
    expect(visitsMigration).toContain("visit.user_id = auth.uid()");
  });

  it("allows V1.3 server-side photo backfill without opening photo metadata updates", () => {
    expect(visitsMigration).toContain("create or replace function public.enforce_photo_rules()");
    expect(visitsMigration).toContain("new.visit_record_id is distinct from old.visit_record_id");
    expect(visitsMigration).toContain("current_user <> 'postgres'");
    expect(visitsMigration).toContain("new.deleted_at is distinct from old.deleted_at and new.deleted_at is null");
  });
});
