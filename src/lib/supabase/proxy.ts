import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { recordServerMetric } from "@/lib/performance/server";

const staticAssetPath = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$/i;

/** Public pages and assets must not wait for a Supabase session refresh. */
export function shouldBypassSessionRefresh(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return path === "/api/health"
    || path === "/api/metrics"
    || path === "/manifest.webmanifest"
    || path === "/service-worker.js"
    || path === "/offline"
    || path === "/launch"
    || path === "/login"
    || path === "/forgot-password"
    || path === "/reset-password"
    || path.startsWith("/_next/static/")
    || path.startsWith("/_next/image")
    || path.startsWith("/offline/")
    || path.startsWith("/launch/")
    || staticAssetPath.test(path);
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (shouldBypassSessionRefresh(request.nextUrl.pathname)) return response;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Keep health checks and the public shell available while an environment is
  // being bootstrapped. Authenticated/data-backed routes still require the
  // Supabase values and will surface their own configuration error.
  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } },
  });
  const startedAt = performance.now();
  try {
    const { data } = await supabase.auth.getClaims();
    recordServerMetric("proxy.auth.getClaims", { route: request.nextUrl.pathname, durationMs: performance.now() - startedAt, outcome: "ok", hasSession: Boolean(data?.claims) });
  } catch {
    recordServerMetric("proxy.auth.getClaims", { route: request.nextUrl.pathname, durationMs: performance.now() - startedAt, outcome: "error" });
    throw new Error("session_refresh_failed");
  }
  return response;
}
