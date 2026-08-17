import { NextRequest, NextResponse } from "next/server";

const AMAP_WEB_API = "https://webapi.amap.com";
const AMAP_REST_API = "https://restapi.amap.com";
const UPSTREAM_TIMEOUT_MS = 12_000;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!process.env.AMAP_SECURITY_KEY?.trim()) return errorResponse("amap_security_key_missing", 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return errorResponse("amap_origin_rejected", 403);
  const referrer = request.headers.get("referer");
  if (referrer) {
    try {
      if (new URL(referrer).origin !== request.nextUrl.origin) return errorResponse("amap_origin_rejected", 403);
    } catch {
      return errorResponse("amap_origin_rejected", 403);
    }
  }

  const { path } = await context.params;
  // `/_AMapService` is the fixed prefix required by the official JS API proxy
  // configuration. It is intentionally not forwarded to AMap.
  if (path[0] !== "_AMapService") return errorResponse("amap_path_rejected", 400);
  const upstreamPath = path.slice(1).join("/");
  if (!upstreamPath || upstreamPath.includes("..") || upstreamPath.startsWith("/") || !/^[a-zA-Z0-9/_-]+$/.test(upstreamPath)) return errorResponse("amap_path_rejected", 400);

  const upstream = new URL(upstreamPath.startsWith("v4/map/styles") ? `${AMAP_WEB_API}/${upstreamPath}` : `${AMAP_REST_API}/${upstreamPath}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key !== "jscode") upstream.searchParams.set(key, value);
  });
  upstream.searchParams.set("jscode", process.env.AMAP_SECURITY_KEY.trim());

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), UPSTREAM_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(upstream, {
      headers: { accept: request.headers.get("accept") ?? "*/*" },
      cache: "no-store",
      signal: abortController.signal,
    });
  } catch (error) {
    return errorResponse(error instanceof Error && error.name === "AbortError" ? "amap_upstream_timeout" : "amap_upstream_unavailable", 503);
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401 || response.status === 403) return errorResponse("amap_upstream_rejected", 502);
  if (response.status === 429) return errorResponse("amap_upstream_rate_limited", 429);
  if (response.status >= 500) return errorResponse("amap_upstream_unavailable", 503);
  if (!response.ok) return errorResponse("amap_upstream_bad_request", 502);
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new NextResponse(response.body, { status: response.status, headers });
}
