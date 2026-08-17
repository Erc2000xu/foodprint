declare global {
  interface Window {
    _AMapSecurityConfig?: { serviceHost?: string };
  }
}

export async function loadAmap(apiKey: string, plugins: string[] = []) {
  return loadAmapWithTimeout(apiKey, plugins);
}

const DEFAULT_AMAP_TIMEOUT_MS = 8_000;
let loadSignature = "";
let loadPromise: Promise<unknown> | undefined;

function getLoadPromise(apiKey: string, plugins: string[]) {
  const signature = `${apiKey}\u0000${[...plugins].sort().join(",")}`;
  if (!loadPromise || loadSignature !== signature) {
    loadSignature = signature;
    // AMap requires this fixed `/_AMapService` suffix for its secure proxy
    // mode. The server appends the secret jscode, so it never reaches the page.
    window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/api/amap/_AMapService` };
    const pending = import("@amap/amap-jsapi-loader").then(({ default: AMapLoader }) => AMapLoader.load({ key: apiKey, version: "2.0", plugins }));
    loadPromise = pending.then((value) => value, (error: unknown) => {
      loadPromise = undefined;
      throw error;
    });
  }
  return loadPromise;
}

function loadAmapWithTimeout(apiKey: string, plugins: string[], timeoutMs = DEFAULT_AMAP_TIMEOUT_MS) {
  const pending = getLoadPromise(apiKey, plugins);
  return new Promise<unknown>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("amap_sdk_timeout")), timeoutMs);
    pending.then((value) => {
      window.clearTimeout(timer);
      resolve(value);
    }, (error: unknown) => {
      window.clearTimeout(timer);
      reject(error);
    });
  });
}
