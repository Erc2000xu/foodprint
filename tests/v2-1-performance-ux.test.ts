import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { shouldBypassSessionRefresh } from "@/lib/supabase/proxy";
import { buildServiceWorkerScript, navigationTimeoutMs } from "@/lib/pwa/service-worker-script";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("V2.1 performance and privacy contracts", () => {
  it("keeps the public session-refresh boundary narrow", () => {
    expect(shouldBypassSessionRefresh("/login")).toBe(true);
    expect(shouldBypassSessionRefresh("/forgot-password")).toBe(true);
    expect(shouldBypassSessionRefresh("/reset-password")).toBe(true);
    expect(shouldBypassSessionRefresh("/launch")).toBe(true);
    expect(shouldBypassSessionRefresh("/offline")).toBe(true);
    expect(shouldBypassSessionRefresh("/manifest.webmanifest")).toBe(true);
    expect(shouldBypassSessionRefresh("/service-worker.js")).toBe(true);
    expect(shouldBypassSessionRefresh("/api/health")).toBe(true);
    expect(shouldBypassSessionRefresh("/api/metrics")).toBe(true);
    expect(shouldBypassSessionRefresh("/fonts/source-han-sans-sc-v2.005.woff2")).toBe(true);
    expect(shouldBypassSessionRefresh("/")).toBe(false);
    expect(shouldBypassSessionRefresh("/try")).toBe(false);
    expect(shouldBypassSessionRefresh("/auth/callback")).toBe(false);
  });

  it("points PWA cold start at a public shell", () => {
    const appManifest = manifest();
    expect(appManifest.start_url).toBe("/launch");
    expect(appManifest.scope).toBe("/");
    expect(appManifest.id).toBe("/launch");
  });

  it("generates a versioned service worker with bounded navigation and no private caches", () => {
    const script = buildServiceWorkerScript("test-build");
    expect(navigationTimeoutMs).toBeLessThanOrEqual(10_000);
    expect(script).toContain("foodprint-shell-test-build");
    expect(script).toContain("Promise.allSettled");
    expect(script).toContain("AbortController");
    expect(script).toContain("/launch");
    expect(script).not.toContain("caches.match(\"/\")");
    expect(script).not.toContain("/api/");
    expect(script).not.toContain("signedUrl");
  });

  it("does not run homepage backfill and keeps deployment logs privacy-safe", () => {
    const mapBrowser = read("src/components/map/map-browser.tsx");
    const tryActions = read("src/app/try/actions.ts");
    const markActions = read("src/app/mark/actions.ts");
    const amapFunction = read("supabase/functions/amap-poi-search/index.ts");
    const adminActions = read("src/app/admin/actions.ts");
    const nginxHttp = read("deploy/nginx/foodprint-http.conf");
    const nginxServer = read("deploy/nginx/foodprint.conf");
    expect(mapBrowser).not.toContain("backfillAmapBusinessAreas");
    expect(mapBrowser).toContain("getAmapBeijingDistricts({ signal: controller.signal })");
    expect(tryActions).not.toContain("business_area_backfill");
    expect(markActions).not.toContain("business_area_backfill");
    expect(amapFunction).toContain('memberships.some((membership) => membership.role === "owner")');
    expect(adminActions).toContain('operation: "business_area_backfill"');
    expect(nginxHttp).toContain("$request_time");
    expect(nginxHttp).toContain("$upstream_response_time");
    expect(nginxHttp).toContain("foodprint_pages");
    expect(nginxHttp).toContain("foodprint_api");
    expect(nginxHttp).toContain("foodprint_auth");
    expect(nginxHttp).not.toContain("$http_cookie");
    expect(nginxHttp).not.toContain("$http_authorization");
    expect(nginxServer).toContain("proxy_read_timeout 15s");
  });
});
