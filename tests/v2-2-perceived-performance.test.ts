import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildServiceWorkerScript, navigationTimeoutMs } from "@/lib/pwa/service-worker-script";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("V2.2 perceived-performance contracts", () => {
  it("keeps launch navigation client-side and user-controlled on failure", () => {
    const launch = read("src/components/pwa/launch-gate.tsx");
    expect(launch).toContain("router.prefetch(\"/\")");
    expect(launch).toContain("router.replace(\"/\")");
    expect(launch).not.toContain("window.location.replace");
    expect(launch).not.toContain("window.location.reload");
    expect(launch).toContain("2_500");
    expect(launch).toContain("6_000");
    expect(launch).toContain("查看离线说明");
  });

  it("keeps the public shell bounded and never caches private app responses", () => {
    expect(navigationTimeoutMs).toBeLessThanOrEqual(4_000);
    const script = buildServiceWorkerScript("v2-2-test");
    expect(script).toContain("Promise.allSettled");
    expect(script).toContain("cacheFirst");
    expect(script).toContain("source-han-sans-sc-ui-v2-2.woff2");
    expect(script).not.toContain("/api/");
    expect(script).not.toContain("signedUrl");
    expect(script).not.toContain("caches.match(\"/\")");
  });

  it("exposes the three navigation states and route content markers", () => {
    const coordinator = read("src/components/navigation/navigation-coordinator.tsx");
    expect(coordinator).toContain('"intent"');
    expect(coordinator).toContain('"shell-visible"');
    expect(coordinator).toContain('"content-ready"');
    expect(coordinator).toContain("10_000");
    expect(coordinator).toContain("navigation_pending_feedback");
    expect(coordinator).toContain("requestIdleCallback");
    expect(coordinator).toContain("onTouchStart");
    for (const route of ["activity", "admin", "mark", "try"]) {
      expect(read(`src/app/${route}/loading.tsx`)).toContain("RouteLoading");
      expect(read(`src/app/${route}/error.tsx`)).toContain("RouteError");
    }
    expect(read("src/app/place/[id]/loading.tsx")).toContain("RouteLoading");
    expect(read("src/app/place/[id]/error.tsx")).toContain("RouteError");
    expect(read("src/components/map/map-browser.tsx")).toContain("sessionStorage");
    expect(read("src/app/place/[id]/page.tsx")).toContain('source="back"');
  });

  it("uses batched thumbnail signing and keeps canonical photos out of card delivery", () => {
    for (const file of ["src/lib/discovery/server.ts", "src/app/activity/page.tsx", "src/app/place/[id]/page.tsx"]) {
      const source = read(file);
      expect(source).not.toContain("createSignedUrl(");
      expect(source).toContain("createSignedUrls");
      expect(source).toContain("thumbnail_object_key");
    }
    const privatePhoto = read("src/components/photo/private-photo.tsx");
    expect(privatePhoto).toContain('loading={priority ? "eager" : "lazy"}');
    expect(privatePhoto).toContain('decoding="async"');
    expect(privatePhoto).toContain("photoIds");
    expect(read("src/app/api/photos/sign/route.ts")).toContain(".max(20)");
  });

  it("enforces the font and thumbnail budgets", () => {
    const subset = resolve(root, "public/fonts/source-han-sans-sc-ui-v2-2.woff2");
    expect(statSync(subset).size).toBeLessThanOrEqual(300 * 1024);
    expect(read("src/app/globals.css")).not.toContain("source-han-sans-sc-v2.005.woff2");
    expect(read("scripts/check-resource-budget.mjs")).toContain("300 * 1024");
    const migration = read("supabase/migrations/20260810120000_v2_2_read_models_and_photo_thumbnails.sql");
    expect(migration).toContain("thumbnail_size_bytes between 1 and 122880");
    expect(migration).toContain("thumbnail_object_key");
    expect(read("src/app/mark/actions.ts")).toContain("16 * 1024 * 1024");
    expect(read("src/app/mark/actions.ts")).toContain("600 * 1024");
    expect(read("src/app/mark/actions.ts")).toContain("120 * 1024");
  });

  it("keeps photo backfill dry-run, bounded and non-destructive", () => {
    const backfill = read("scripts/backfill-photo-thumbnails.mjs");
    expect(backfill).toContain("PHOTO_BACKFILL_BATCH_SIZE ?? 20");
    expect(backfill).toContain("Math.min(2");
    expect(backfill).toContain("thumbnail_object_key");
    expect(backfill).toContain("--execute");
    expect(backfill).toContain("upsert: false");
    expect(backfill).toContain("totalThumbnailBytes");
    expect(backfill).not.toContain("createSignedUrl");
    const audit = read("scripts/audit-photo-thumbnail-orphans.mjs");
    expect(audit).toContain("orphanThumbnailObjects");
    expect(audit).toContain("missingThumbnailObjects");
    expect(audit).not.toContain("remove(");
  });
});
