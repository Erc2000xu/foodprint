export type AmapFailureCategory =
  | "network_failure"
  | "origin_rejected"
  | "provider_timeout"
  | "provider_auth_failure"
  | "provider_unavailable";

type CorsOptions = { methods: string; contentType?: string };

/**
 * Parses only complete http(s) origins. Wildcards, paths, credentials and
 * malformed values are deliberately ignored so a bad secret fails closed.
 */
export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const value of (raw ?? "").split(",")) {
    const origin = value.trim();
    if (!origin) continue;
    try {
      const url = new URL(origin);
      if ((url.protocol === "https:" || url.protocol === "http:") && url.origin === origin) origins.add(origin);
    } catch {
      // Invalid configuration must never broaden the CORS boundary.
    }
  }
  return origins;
}

export function isAllowedOrigin(origin: string | null, allowedOrigins: Set<string>): boolean {
  // Origin-less requests still require a valid bearer token and are useful for
  // controlled server-side diagnostics. Browser requests must match exactly.
  return origin === null || allowedOrigins.has(origin);
}

export function corsHeaders(origin: string | null, allowedOrigins: Set<string>, options: CorsOptions): HeadersInit {
  const headers: Record<string, string> = {
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": options.methods,
    "cache-control": "no-store",
    "vary": "Origin",
  };
  if (options.contentType) headers["content-type"] = options.contentType;
  if (origin && allowedOrigins.has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

export function classifyProviderFailure(status: number, infocode?: string): AmapFailureCategory {
  // AMap key/account failures are returned as HTTP 200 with an infocode; do
  // not relay that provider detail to the browser.
  if (status === 401 || status === 403 || /^1000[1-9]$/.test(infocode ?? "")) return "provider_auth_failure";
  return "provider_unavailable";
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/** Logs only aggregate-safe operational fields; never keywords, coordinates, user IDs or secrets. */
export function logAmapEvent(event: {
  operation: "poi_search" | "static_map";
  outcome: "success" | "failure";
  durationMs: number;
  category?: AmapFailureCategory;
  upstreamStatus?: number;
  infocode?: string;
}) {
  console.info("amap_event", JSON.stringify(event));
}
