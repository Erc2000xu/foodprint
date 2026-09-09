import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(resolve(root, "supabase/migrations/20260907120000_parking_map_v1.sql"), "utf8");
const home = readFileSync(resolve(root, "src/components/map/map-browser.tsx"), "utf8");
const parkingPage = readFileSync(resolve(root, "src/app/parking/page.tsx"), "utf8");
const parkingBrowser = readFileSync(resolve(root, "src/components/parking/parking-browser.tsx"), "utf8");
const parkingActions = readFileSync(resolve(root, "src/app/parking/actions.ts"), "utf8");
const accessManagement = readFileSync(resolve(root, "src/components/admin/parking-access-management.tsx"), "utf8");
const asset = resolve(root, "public/icons/map-controls/motorcycle-parking-button-honey-v3.png");

describe("motorcycle parking V1 contract", () => {
  it("keeps parking data isolated and protected by its own access model", () => {
    expect(migration).toContain("create table public.parking_feature_config");
    expect(migration).toContain("create table public.parking_feature_access");
    expect(migration).toContain("create table public.parking_marks");
    expect(migration).toContain("enabled boolean not null default false");
    expect(migration).toContain("alter table public.parking_feature_config enable row level security");
    expect(migration).toContain("alter table public.parking_feature_access enable row level security");
    expect(migration).toContain("alter table public.parking_marks enable row level security");
    expect(migration).toContain("parking users read active shared marks");
    expect(migration).toContain("public.can_use_parking(group_id) and deleted_at is null");
    expect(migration).toContain("created_by <> v_user_id");
    expect(migration).toContain("deleted_at = now()");
    expect(migration).toContain("idempotency_key uuid not null");
    expect(migration).toContain("revoke all on function public.can_use_parking(uuid, uuid) from public, anon, authenticated");
    expect(migration).not.toContain("grant execute on function public.can_use_parking(uuid, uuid) to authenticated");
    expect(migration).toContain("case when v_can_manage then 1 else 0 end");
  });

  it("binds the manager to a verified existing owner and revokes access on suspension/removal", () => {
    expect(migration).toContain("initialize_parking_feature");
    expect(migration).toContain("membership.role = 'owner'");
    expect(migration).toContain("membership.status = 'active'");
    expect(migration).toContain("controlled initialization required");
    expect(migration).toContain("group_members_revoke_parking_access");
    expect(migration).toContain("old.status = 'active' and new.status <> 'active'");
    expect(migration).toContain("revoked_at = coalesce(revoked_at, now())");
    expect(migration).toContain("grant execute on function public.initialize_parking_feature(uuid, uuid, boolean) to service_role");
    expect(migration).not.toContain("insert into public.parking_feature_config (group_id, manager_user_id, enabled) values (p_group_id, auth.uid()");
  });

  it("exposes only the requested map entry and center-crosshair flow", () => {
    expect(home).toContain("/icons/map-controls/motorcycle-parking-button-honey-v3.png");
    expect(home).toContain("motorcycle-parking-button-honey-v3-3x.png 3x");
    expect(home).toContain('href="/parking"');
    expect(home).toContain("canUseParking");
    expect(parkingPage).toContain("if (!access?.canUse) notFound()");
    expect(parkingBrowser).toContain("拖动地图，不用手指在地图上画线；中心准星的位置就是当前节点");
    expect(parkingBrowser).toContain("请先勾选“我确认这里方便停摩托车”");
    expect(parkingBrowser).toContain("我确认这里方便停摩托车");
    expect(parkingActions).toContain("保存失败，请保留草稿后重试。");
    expect(parkingActions).toContain("p_idempotency_key: parsedKey.data.requestKey");
    expect(accessManagement).toContain("只有指定管理人能在这里授权");
  });

  it("ships the existing V3 button asset without replacing it", () => {
    expect(existsSync(asset)).toBe(true);
    expect(statSync(asset).size).toBeGreaterThan(1000);
    expect(readFileSync(asset).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(existsSync(resolve(root, "public/icons/map-controls/motorcycle-parking-button-honey-v3-1x.png"))).toBe(true);
    expect(existsSync(resolve(root, "public/icons/map-controls/motorcycle-parking-button-honey-v3-2x.png"))).toBe(true);
    expect(existsSync(resolve(root, "public/icons/map-controls/motorcycle-parking-button-honey-v3-3x.png"))).toBe(true);
  });
});
