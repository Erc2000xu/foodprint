"use client";

import AMapLoader from "@amap/amap-jsapi-loader";

declare global {
  interface Window {
    _AMapSecurityConfig?: { serviceHost?: string; securityJsCode?: string };
  }
}

async function getSecurityJsCode() {
  const response = await fetch("/api/amap/security", { cache: "no-store" });
  if (!response.ok) throw new Error("AMap security configuration unavailable");
  const payload = await response.json() as { securityJsCode?: unknown };
  return typeof payload.securityJsCode === "string" && payload.securityJsCode ? payload.securityJsCode : undefined;
}

export async function loadAmap(apiKey: string, plugins: string[] = []) {
  // Direct security configuration is AMap's most reliable JS API mode. The
  // code is served only by our same-origin route and the key remains domain-bound.
  const securityJsCode = await getSecurityJsCode();
  window._AMapSecurityConfig = securityJsCode ? { securityJsCode } : { serviceHost: `${window.location.origin}/api/amap` };
  return AMapLoader.load({ key: apiKey, version: "2.0", plugins });
}
