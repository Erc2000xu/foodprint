import type { ClientMetricDetail, ClientMetricDimensions, ClientMetricName } from "./metrics";

function normalizeRoute(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (path === "/") return "/";
  if (/^\/place\/[^/]+/.test(path)) return "/place/:id";
  if (/^\/join\/[^/]+/.test(path)) return "/join/:token";
  if (/^\/api\/v1\/places\/search/.test(path)) return "/api/v1/places/search";
  return path.slice(0, 120);
}

type ClientMetricEnvelope = {
  metric: ClientMetricName;
  value: number;
  route: string;
  detail?: ClientMetricDetail;
  dimensions?: ClientMetricDimensions;
};

const metricQueue: ClientMetricEnvelope[] = [];
let flushTimer: number | undefined;

function flushClientMetrics() {
  if (typeof window === "undefined" || metricQueue.length === 0) return;
  const metrics = metricQueue.splice(0, 20);
  const body = JSON.stringify({ metrics });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (document.visibilityState === "hidden" && navigator.sendBeacon?.("/api/metrics", blob)) return;
  } catch {
    // Fall back to keepalive fetch when Blob or sendBeacon is unavailable.
  }
  void fetch("/api/metrics", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

function scheduleMetricFlush() {
  if (typeof window === "undefined" || flushTimer !== undefined) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    flushClientMetrics();
    if (metricQueue.length > 0) scheduleMetricFlush();
  }, 2_000);
}

export function reportClientMetric(name: ClientMetricName, value: number, detail?: ClientMetricDetail, dimensions?: ClientMetricDimensions) {
  if (typeof window === "undefined" || !Number.isFinite(value) || value < 0) return;
  metricQueue.push({ metric: name, value: Math.round(value * 10) / 10, route: normalizeRoute(window.location.pathname), detail, dimensions });
  if (metricQueue.length >= 20) flushClientMetrics();
  else scheduleMetricFlush();
}

export function clientDisplayMode(): "browser" | "standalone" {
  if (typeof window === "undefined") return "browser";
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone ? "standalone" : "browser";
}

export function clientNetworkType(): "wifi" | "cellular" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const connection = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string } }).connection;
  if (connection?.type === "wifi") return "wifi";
  if (connection?.type === "cellular" || connection?.effectiveType === "4g" || connection?.effectiveType === "3g" || connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g") return "cellular";
  return "unknown";
}

export function markClientPerformance(name: string) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try { performance.mark(name); } catch { /* Performance marks are optional. */ }
}

export function elapsedFromClientPerformance(name: string) {
  if (typeof performance === "undefined") return 0;
  if (typeof performance.getEntriesByName !== "function") return performance.now();
  const entry = performance.getEntriesByName(name).at(-1);
  return entry ? Math.max(0, performance.now() - entry.startTime) : performance.now();
}

export function shouldSkipIntentPrefetch() {
  if (typeof navigator === "undefined") return true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g");
}
