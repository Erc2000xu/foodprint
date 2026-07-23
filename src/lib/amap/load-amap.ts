"use client";

import AMapLoader from "@amap/amap-jsapi-loader";

declare global {
  interface Window {
    _AMapSecurityConfig?: { serviceHost?: string };
  }
}

export async function loadAmap(apiKey: string, plugins: string[] = []) {
  // AMap requires this fixed `/_AMapService` suffix for its secure proxy
  // mode. The server appends the secret jscode, so it never reaches the page.
  window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/api/amap/_AMapService` };
  return AMapLoader.load({ key: apiKey, version: "2.0", plugins });
}
