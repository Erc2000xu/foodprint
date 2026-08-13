export type DiscoveryMapRuntimeConfig =
  | { enabled: false }
  | { enabled: true; jsApiKey: string };

/** Server-only runtime config. The browser receives the key only when the map is enabled. */
export function readDiscoveryMapRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): DiscoveryMapRuntimeConfig {
  if (env.DISCOVERY_DYNAMIC_MAP_ENABLED === "false") return { enabled: false };
  const jsApiKey = env.AMAP_JS_KEY?.trim();
  return jsApiKey ? { enabled: true, jsApiKey } : { enabled: false };
}
