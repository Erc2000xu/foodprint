import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("V2.4.2 forward-only contracts", () => {
  it("adds versioned price, read, export, and management RPCs without replacing old paths", () => {
    const migration = read("supabase/migrations/20260827090000_v2_4_2_nearby_management_price.sql");
    expect(migration).toContain("add column if not exists price_per_person numeric(10,2)");
    expect(migration).toContain("price_per_person is null");
    expect(migration).toContain("record_place_visit_v2_4_2");
    expect(migration).toContain("list_discovery_index_v2_4_2");
    expect(migration).toContain("get_group_place_detail_v2_4_2");
    expect(migration).toContain("export_my_v2_4_2_records");
    expect(migration).toContain("list_group_place_management_v2_4_2");
    expect(migration).toContain("list_group_candidate_management_v2_4_2");
    expect(migration).toContain("list_group_hidden_content_v2_4_2");
    expect(migration).toContain("where context.role in ('owner'::public.group_role, 'admin'::public.group_role)");
    expect(migration).toContain("is_active_group_member");
    expect(migration).toContain("grant execute on function public.list_group_hidden_content_v2_4_2");
    expect(migration).not.toContain("drop function if exists public.record_place_visit(");
    expect(migration).not.toContain("drop function if exists public.save_candidate_promotion_mark(");
    expect(migration).toContain("p_cursor_sort_at");
    expect(migration).toContain("p_cursor_id");
    expect(migration).toContain("(sort_at, group_place_id) < (p_cursor_sort_at, p_cursor_id)");
    expect(migration).toContain("round(avg(visit.price_per_person), 2)");
    expect(migration).toContain("visit.deleted_at is null");
    expect(migration).toContain("visit.hidden_at is null");
    expect(migration.match(/security definer/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("keeps current location in memory and never puts it in the shareable filter state", () => {
    const browser = read("src/components/map/map-browser.tsx");
    const preference = read("src/components/admin/location-preference-control.tsx");
    const logout = read("src/components/admin/logout-button.tsx");
    const searchState = read("src/lib/discovery/search-state.ts");
    const location = read("src/lib/discovery/location-session.ts");
    expect(browser).toContain("const mapReturnStateCache = new Map");
    expect(browser).toContain("setLocationAnchor({ id: candidate.poiId");
    expect(browser).not.toContain("sessionStorage.setItem(\"foodprint:map-return");
    expect(searchState).not.toContain("params.set(\"locationLat\"");
    expect(searchState).not.toContain("params.set(\"locationLng\"");
    expect(location).toContain("Only a boolean consent decision is stored");
    expect(preference).toContain("writeLocationConsent");
    expect(preference).not.toContain("latitude");
    expect(preference).not.toContain("longitude");
    expect(logout).toContain("clearLocationConsent");
    expect(logout).toContain("foodprint:session-ending");
    expect(browser).toContain("foodprint:session-ending");
  });

  it("keeps the full-size photo path and nine-photo V2.4.1 limit intact", () => {
    const actions = read("src/app/mark/actions.ts");
    expect(actions).toContain("if (displays.length > 9 || thumbnails.length > 9)");
    expect(actions).toContain("photo_thumbnails");
    expect(actions).toContain("stablePhotoId");
  });

  it("keeps price validation server-side and out of metrics/audit payloads", () => {
    const actions = read("src/app/mark/actions.ts");
    const firstMarkForm = read("src/components/mark/mark-flow.tsx");
    const repeatVisitForm = read("src/components/mark/meal-record-form.tsx");
    const migration = read("supabase/migrations/20260827090000_v2_4_2_nearby_management_price.sql");
    expect(actions).toContain("parseOptionalPrice");
    expect(actions).toContain("p_price_per_person: price ?? null");
    expect(firstMarkForm).toContain('name="price_per_person"');
    expect(repeatVisitForm).toContain('name="price_per_person"');
    expect(firstMarkForm).toContain("本次人均（可选）");
    expect(repeatVisitForm).toContain("本次人均（可选）");
    expect(migration).toContain("p_price_per_person numeric default null");
    expect(migration).toContain("'opinion_changed', p_opinion_changed");
    expect(migration).not.toContain("'price_per_person', p_price_per_person");
  });

  it("keeps management reads current-group Owner/Admin scoped and returns retryable page fields", () => {
    const actions = read("src/app/admin/actions.ts");
    const center = read("src/components/admin/content-management-center.tsx");
    expect(actions).toContain("p_limit: parsed.data.limit ?? 20");
    expect(actions).toContain("p_cursor_sort_at");
    expect(actions).toContain("p_cursor_id");
    expect(actions).toContain("只有 Owner 或 Admin 可以打开管理中心");
    expect(center).toContain("lastLoadOptionsRef");
    expect(center).toContain("重试");
    expect(center).toContain("已下架地点");
    expect(center).toContain("options.append ? { ...current, error: result.error } : result");
  });
});
