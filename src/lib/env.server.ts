export type DiscoveryMapRuntimeConfig =
  | { enabled: false }
  | { enabled: true; jsApiKey: string; locationOnEntryEnabled?: boolean };

/** Server-only runtime config. The browser receives the key only when the map is enabled. */
export function readDiscoveryMapRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): DiscoveryMapRuntimeConfig {
  if (env.DISCOVERY_DYNAMIC_MAP_ENABLED === "false") return { enabled: false };
  const jsApiKey = env.AMAP_JS_KEY?.trim();
  if (!jsApiKey) return { enabled: false };
  return env.DISCOVERY_LOCATION_ON_ENTRY_ENABLED === undefined
    ? { enabled: true, jsApiKey }
    : { enabled: true, jsApiKey, locationOnEntryEnabled: env.DISCOVERY_LOCATION_ON_ENTRY_ENABLED !== "false" };
}
