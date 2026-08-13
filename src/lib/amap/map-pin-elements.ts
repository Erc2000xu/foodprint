import {
  formatMapClusterCount,
  MAP_CLUSTER_ASSETS,
  MAP_PIN_METRICS,
  MAP_USER_LOCATION_ASSET,
  mapPinAssetSource,
  type MapPinRecommendationLevel,
} from "@/lib/amap/map-pin-assets";

type MapPinElementOptions = {
  level: MapPinRecommendationLevel;
  selected?: boolean;
  accessibleLabel: string;
};

type MapClusterElementOptions = {
  count: number;
  active?: boolean;
};

type MapUserLocationElementOptions = {
  accessibleLabel?: string;
};

function createMarkerRoot(className: string, accessibleLabel: string) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = className;
  root.setAttribute("aria-label", accessibleLabel);
  return root;
}

export function createMapPinElement({
  level,
  selected = false,
  accessibleLabel,
}: MapPinElementOptions) {
  const state = selected ? "selected" : "default";
  const root = createMarkerRoot(
    `foodprint-map-pin foodprint-map-pin--${state}`,
    accessibleLabel,
  );
  root.dataset.level = String(level);
  root.dataset.state = state;
  root.setAttribute("aria-pressed", String(selected));

  const image = document.createElement("img");
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.decoding = "async";
  image.draggable = false;
  image.src = mapPinAssetSource(level, state);
  image.width = selected
    ? MAP_PIN_METRICS.selected.width
    : MAP_PIN_METRICS.default.width;
  image.height = selected
    ? MAP_PIN_METRICS.selected.height
    : MAP_PIN_METRICS.default.height;
  root.append(image);

  return root;
}

export function createMapClusterElement({
  count,
  active = false,
}: MapClusterElementOptions) {
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const state = active ? "active" : "default";
  const root = createMarkerRoot(
    `foodprint-map-pin foodprint-map-pin--cluster foodprint-map-pin--cluster-${state}`,
    `包含 ${safeCount} 家已推荐地点，放大地图查看`,
  );
  root.dataset.count = String(safeCount);
  root.dataset.density = safeCount > 99 ? "compact" : "normal";

  const imageMetrics = active
    ? MAP_PIN_METRICS.clusterActive
    : MAP_PIN_METRICS.cluster;
  const countPosition = mapClusterCountPosition(
    imageMetrics.width,
    imageMetrics.height,
  );
  root.style.setProperty(
    "--foodprint-cluster-count-x",
    `${countPosition.x}px`,
  );
  root.style.setProperty(
    "--foodprint-cluster-count-y",
    `${countPosition.y}px`,
  );

  const image = document.createElement("img");
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.decoding = "async";
  image.draggable = false;
  image.src = MAP_CLUSTER_ASSETS[state];
  image.width = active
    ? MAP_PIN_METRICS.clusterActive.width
    : MAP_PIN_METRICS.cluster.width;
  image.height = active
    ? MAP_PIN_METRICS.clusterActive.height
    : MAP_PIN_METRICS.cluster.height;

  const label = document.createElement("span");
  label.className = "foodprint-map-pin__cluster-count";
  label.textContent = formatMapClusterCount(safeCount);
  label.setAttribute("aria-hidden", "true");

  root.append(image, label);
  return root;
}

export function createMapUserLocationElement({
  accessibleLabel = "你的当前位置",
}: MapUserLocationElementOptions = {}) {
  const root = document.createElement("div");
  root.className = "foodprint-map-user-location";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", accessibleLabel);

  const image = document.createElement("img");
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.decoding = "async";
  image.draggable = false;
  image.src = MAP_USER_LOCATION_ASSET;
  image.width = MAP_PIN_METRICS.userLocation.width;
  image.height = MAP_PIN_METRICS.userLocation.height;
  root.append(image);

  return root;
}

export function mapPinPixelOffset(
  width: number,
  height: number,
): { x: number; y: number } {
  const xScale = width / MAP_PIN_METRICS.source.width;
  const yScale = height / MAP_PIN_METRICS.source.height;
  return {
    x: -MAP_PIN_METRICS.source.anchorX * xScale,
    y: -MAP_PIN_METRICS.source.anchorY * yScale,
  };
}

export function mapClusterCountPosition(
  imageWidth: number,
  imageHeight: number,
  containerWidth = MAP_PIN_METRICS.selected.width,
  containerHeight = MAP_PIN_METRICS.selected.height,
): { x: number; y: number } {
  const imageLeft = (containerWidth - imageWidth) / 2;
  const imageTop = containerHeight - imageHeight;
  return {
    x:
      imageLeft +
      (MAP_PIN_METRICS.source.clusterCountCenterX /
        MAP_PIN_METRICS.source.width) *
        imageWidth,
    y:
      imageTop +
      (MAP_PIN_METRICS.source.clusterCountCenterY /
        MAP_PIN_METRICS.source.height) *
        imageHeight,
  };
}
