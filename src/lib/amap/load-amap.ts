"use client";

import AMapLoader from "@amap/amap-jsapi-loader";

declare global {
  interface Window {
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

export function loadAmap(apiKey: string, plugins: string[] = []) {
  window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/api/amap` };
  return AMapLoader.load({ key: apiKey, version: "2.0", plugins });
}
