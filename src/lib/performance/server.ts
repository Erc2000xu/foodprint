type ServerMetricOutcome = "ok" | "error" | "empty" | "timeout";

type ServerMetricFields = {
  route: string;
  durationMs?: number;
  value?: number;
  outcome?: ServerMetricOutcome;
  count?: number;
  hasSession?: boolean;
};

function safeMetricName(metric: string) {
  return metric.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
}

/**
 * Keep server-side performance logs useful without allowing request content,
 * user identifiers, provider URLs or database errors into the log stream.
 */
export function normalizePerformanceRoute(route: string) {
  const pathname = route.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/") return "/";
  if (/^\/place\/[^/]+/.test(pathname)) return "/place/:id";
  if (/^\/join\/[^/]+/.test(pathname)) return "/join/:token";
  if (/^\/api\/v1\/places\/search/.test(pathname)) return "/api/v1/places/search";
  return pathname.slice(0, 120);
}

export function recordServerMetric(metric: string, fields: ServerMetricFields) {
  const payload: Record<string, string | number | boolean> = {
    scope: "foodprint.performance",
    metric: safeMetricName(metric),
    route: normalizePerformanceRoute(fields.route),
  };
  if (fields.durationMs !== undefined && Number.isFinite(fields.durationMs)) payload.durationMs = Math.round(fields.durationMs * 10) / 10;
  if (fields.value !== undefined && Number.isFinite(fields.value)) payload.value = Math.round(fields.value * 10) / 10;
  if (fields.outcome) payload.outcome = fields.outcome;
  if (fields.count !== undefined && Number.isFinite(fields.count)) payload.count = Math.max(0, Math.round(fields.count));
  if (fields.hasSession !== undefined) payload.hasSession = fields.hasSession;
  console.info(JSON.stringify(payload));
}

export async function measureServerOperation<T>(route: string, operation: string, task: () => PromiseLike<T>, getFields?: (result: T) => Pick<ServerMetricFields, "value" | "count" | "hasSession">) {
  const startedAt = performance.now();
  try {
    const result = await task();
    recordServerMetric(operation, { route, durationMs: performance.now() - startedAt, outcome: "ok", ...getFields?.(result) });
    return result;
  } catch (error) {
    recordServerMetric(operation, { route, durationMs: performance.now() - startedAt, outcome: "error" });
    throw error;
  }
}
