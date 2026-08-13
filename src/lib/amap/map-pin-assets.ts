export type MapPinRecommendationLevel = 1 | 2 | 3;
export type MapPinVisualState = "default" | "selected";

export const MAP_PIN_ASSET_VERSION = "v2.3.0" as const;

export const MAP_PIN_ASSETS: Record<
  MapPinRecommendationLevel,
  Record<MapPinVisualState, string>
> = {
  1: {
    default: "/icons/map-pins/pin-level-1-default.svg",
    selected: "/icons/map-pins/pin-level-1-selected.svg",
  },
  2: {
    default: "/icons/map-pins/pin-level-2-default.svg",
    selected: "/icons/map-pins/pin-level-2-selected.svg",
  },
  3: {
    default: "/icons/map-pins/pin-level-3-default.svg",
    selected: "/icons/map-pins/pin-level-3-selected.svg",
  },
};

export const MAP_CLUSTER_ASSETS = {
  default: "/icons/map-pins/cluster-default.svg",
  active: "/icons/map-pins/cluster-active.svg",
} as const;

export const MAP_USER_LOCATION_ASSET = "/icons/map-pins/user-location.svg" as const;

export const MAP_PIN_METRICS = {
  source: {
    width: 64,
    height: 72,
    anchorX: 32,
    anchorY: 72,
    clusterCountCenterX: 32,
    clusterCountCenterY: 30,
  },
  default: {
    width: 40,
    height: 45,
  },
  selected: {
    width: 48,
    height: 54,
  },
  cluster: {
    width: 44,
    height: 50,
  },
  clusterActive: {
    width: 48,
    height: 54,
  },
  userLocation: {
    width: 32,
    height: 32,
  },
  minimumHitTarget: 44,
} as const;

export function mapPinAssetSource(
  level: MapPinRecommendationLevel,
  state: MapPinVisualState = "default",
) {
  return MAP_PIN_ASSETS[level][state];
}

export function toMapPinRecommendationLevel(
  value: number | null | undefined,
): MapPinRecommendationLevel {
  if (Number(value) >= 3) return 3;
  if (Number(value) >= 2) return 2;
  return 1;
}

export function formatMapClusterCount(count: number) {
  if (!Number.isFinite(count) || count < 1) return "1";
  if (count > 99) return "100+";
  return String(Math.floor(count));
}
