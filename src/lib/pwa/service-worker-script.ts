const publicShell = [
  "/launch",
  "/offline",
  "/manifest.webmanifest",
  "/mascot/icon-192.png",
  "/mascot/icon-512.png",
  "/mascot/apple-touch-icon.png",
  "/mascot/offline.jpg",
  "/nav-icons/map.png",
  "/nav-icons/discover.png",
  "/nav-icons/mark.png",
  "/nav-icons/activity.png",
  "/nav-icons/profile.png",
  "/fonts/source-han-sans-sc-ui-v2-2.woff2",
  "/fonts/zcool-xiaowei-v15-subset.woff2",
];

export const serviceWorkerCachePrefix = "foodprint-shell-";
export const navigationTimeoutMs = 3_000;

export function buildServiceWorkerScript(buildId: string) {
  const safeBuildId = buildId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "current";
  return `const CACHE=${JSON.stringify(`${serviceWorkerCachePrefix}${safeBuildId}`)};
const CACHE_PREFIX=${JSON.stringify(serviceWorkerCachePrefix)};
const NAVIGATION_TIMEOUT_MS=${navigationTimeoutMs};
const PUBLIC_SHELL=${JSON.stringify(publicShell)};

function notify(type, detail) {
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => clients.forEach((client) => client.postMessage({ source: "foodprint-service-worker", type, detail })));
}

async function precache() {
  const cache = await caches.open(CACHE);
  let launchHtml = "";
  try {
    const response = await fetch("/launch", { cache: "no-store" });
    if (response.ok) {
      const copy = response.clone();
      await cache.put("/launch", copy);
      launchHtml = await response.text();
    }
  } catch { /* The next online visit can fill the public shell cache. */ }
  const shellAssetManifest = extractShellAssetUrls(launchHtml);
  await Promise.allSettled([...PUBLIC_SHELL.filter((url) => url !== "/launch"), ...shellAssetManifest].map(async (url) => {
    try { await cache.add(url); } catch { /* A single optional asset must not block installation. */ }
  }));
}

function extractShellAssetUrls(html) {
  const urls = [];
  const pattern = /(?:src|href)=["'](\/_next\/static\/[^"']+|\/(?:mascot|nav-icons|icons|fonts)\/[^"']+)["']/g;
  let match;
  while ((match = pattern.exec(html))) if (!urls.includes(match[1])) urls.push(match[1]);
  return urls;
}

async function cacheMatch(url) {
  const cache = await caches.open(CACHE);
  return cache.match(url);
}

async function cacheFirst(request) {
  const cached = await cacheMatch(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function networkNavigation(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok || response.type === "opaqueredirect") return response;
    throw new Error("navigation_failed");
  } catch {
    notify("navigation-fallback", "timeout");
    return (await cacheMatch("/launch")) || (await cacheMatch("/offline")) || new Response("食迹暂时无法连接。", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  } finally {
    clearTimeout(timeout);
  }
}

function isPublicStatic(pathname) {
  return pathname.startsWith("/_next/static/") || pathname === "/manifest.webmanifest" || pathname.startsWith("/mascot/") || pathname.startsWith("/nav-icons/") || pathname.startsWith("/icons/") || pathname.startsWith("/fonts/") || pathname === "/favicon.ico";
}

self.addEventListener("install", (event) => {
  notify("install", CACHE);
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()).then(() => notify("activate", CACHE)));
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "GET_VERSION") event.source?.postMessage({ source: "foodprint-service-worker", type: "version", detail: CACHE });
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (url.pathname === "/launch" || url.pathname === "/offline") event.respondWith(cacheFirst(request));
    else event.respondWith(networkNavigation(request));
    return;
  }
  if (isPublicStatic(url.pathname)) event.respondWith(cacheFirst(request));
});`;
}
