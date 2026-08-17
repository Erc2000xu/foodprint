"use client";

import { useEffect, useMemo, useRef } from "react";
import { createMapClusterElement, createMapPinElement, createMapUserLocationElement, mapPinPixelOffset } from "@/lib/amap/map-pin-elements";
import { mapFailure, mapFailureFromUnknown, type MapFailure } from "@/lib/amap/map-failure";
import { loadAmap } from "@/lib/amap/load-amap";
import { toMapPinRecommendationLevel } from "@/lib/amap/map-pin-assets";
import { buildMapCoordinateBuckets, createMapPinData, readMapPlaceReference, resolveMapPlaceIndex } from "@/lib/amap/map-pin-mapping";
import type { LngLat, MapDiscoveryPlace, MapPadding, MapViewport } from "@/lib/discovery/types";
import { reportClientMetric } from "@/lib/performance/client";

type AMapEventHandler = (...args: unknown[]) => void;
type AMapPosition = { getLng?: () => number; getLat?: () => number; lng?: number; lat?: number };
type AMapBounds = { getSouthWest?: () => AMapPosition; getNorthEast?: () => AMapPosition };

type AMapMarker = {
  on?: (event: string, handler: AMapEventHandler) => void;
  off?: (event: string, handler: AMapEventHandler) => void;
  setContent?: (content: HTMLElement) => void;
  setOffset?: (offset: unknown) => void;
  setExtData?: (value: unknown) => void;
  getExtData?: () => unknown;
  getPosition?: () => AMapPosition;
  setMap?: (map: AMapMap | null) => void;
  setZIndex?: (zIndex: number) => void;
};

type AMapMap = {
  on: (event: string, handler: AMapEventHandler) => void;
  off?: (event: string, handler: AMapEventHandler) => void;
  getBounds?: () => AMapBounds;
  getCenter?: () => AMapPosition;
  getZoom?: () => number;
  setFitView?: (overlays?: unknown[], immediately?: boolean, padding?: number[], maxZoom?: number) => void;
  setZoomAndCenter?: (zoom: number, center: number[]) => void;
  setCenter?: (center: number[]) => void;
  panTo?: (center: number[]) => void;
  panBy?: (x: number, y: number) => void;
  setPadding?: (padding: [number, number, number, number]) => void;
  lngLatToContainer?: (lngLat: number[]) => { getX?: () => number; getY?: () => number; x?: number; y?: number };
  plugin?: (plugins: string[], callback: () => void) => void;
  destroy?: () => void;
};

type AMapGeolocation = {
  getCurrentPosition: (callback: (status: string, result: unknown) => void) => void;
};

type AMapCluster = {
  setData: (data: unknown[]) => void;
  setMap?: (map: AMapMap | null) => void;
  on?: (event: string, handler: AMapEventHandler) => void;
  off?: (event: string, handler: AMapEventHandler) => void;
};

type AMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  Pixel: new (x: number, y: number) => unknown;
  MarkerCluster: new (map: AMapMap, data: unknown[], options: Record<string, unknown>) => AMapCluster;
  Geolocation: new (options: Record<string, unknown>) => AMapGeolocation;
  Bounds?: new (southWest: unknown, northEast: unknown) => unknown;
  LngLat?: new (longitude: number, latitude: number) => unknown;
};

type ClusterContext = {
  marker?: AMapMarker | AMapMarker[];
  count?: number;
  markers?: AMapMarker[];
  data?: unknown;
  clusterData?: unknown[];
};

type MapAdapterProps = {
  apiKey: string;
  pins: MapDiscoveryPlace[];
  selectedPlaceId?: string;
  userLocation?: LngLat;
  retryGeneration?: number;
  locateRequest?: number;
  fitRequestKey?: string;
  restoreViewport?: MapViewport;
  padding?: MapPadding;
  onReady?: () => void;
  onViewportSettled?: (viewport: MapViewport) => void;
  onSelectPlace?: (placeId: string) => void;
  onClearSelection?: () => void;
  onClusterOpened?: (placeIds: string[]) => void;
  onLocationResult?: (location: LngLat) => void;
  onLocationError?: (failure: MapFailure) => void;
  onFatalError?: (failure: MapFailure) => void;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positionToLngLat(position: AMapPosition | null | undefined): LngLat | null {
  if (!position) return null;
  const longitude = numberValue(typeof position.getLng === "function" ? position.getLng() : position.lng);
  const latitude = numberValue(typeof position.getLat === "function" ? position.getLat() : position.lat);
  return longitude === null || latitude === null ? null : { longitude, latitude };
}

function readClusterContext(value: unknown): ClusterContext {
  return asObject(value) as ClusterContext ?? {};
}

function readClusterEventContext(value: unknown): ClusterContext {
  const context = readClusterContext(value);
  const event = asObject(value);
  const target = asObject(event?.target);
  if (!context.marker && target) return { ...context, marker: target as AMapMarker };
  return context;
}

function markerList(value: unknown): AMapMarker[] {
  if (Array.isArray(value)) return value.filter((candidate): candidate is AMapMarker => Boolean(asObject(candidate)));
  return asObject(value) ? [value as AMapMarker] : [];
}

function readClusterCount(context: ClusterContext) {
  const count = numberValue(context.count);
  if (count !== null) return Math.max(1, Math.floor(count));
  return Math.max(1, markerList(context.marker).length, context.markers?.length ?? 0, context.clusterData?.length ?? 0, Array.isArray(context.data) ? context.data.length : 0);
}

function readClusterPlaceIds(context: ClusterContext, places: readonly MapDiscoveryPlace[]) {
  const ids = new Set<string>();
  const candidates = [...markerList(context.marker), ...(context.markers ?? []), ...(context.clusterData ?? []), ...(Array.isArray(context.data) ? context.data : context.data ? [context.data] : [])];
  candidates.forEach((candidate) => {
    const data = asObject(candidate);
    const extension = data && typeof data.getExtData === "function" ? asObject(data.getExtData()) : asObject(data?.extData);
    const clusterIds = extension?.clusterPlaceIds ?? data?.clusterPlaceIds;
    if (Array.isArray(clusterIds)) clusterIds.forEach((id) => { if (typeof id === "string") ids.add(id); });
    const reference = readMapPlaceReference(candidate);
    const extensionReference = readMapPlaceReference(extension);
    const resolvedReference = reference.placeId || reference.placeIndex !== undefined ? reference : extensionReference;
    if (resolvedReference.placeId && places.some((place) => place.id === resolvedReference.placeId)) ids.add(resolvedReference.placeId);
    if (resolvedReference.placeIndex !== undefined && places[resolvedReference.placeIndex]) ids.add(places[resolvedReference.placeIndex].id);
  });
  return [...ids];
}

function viewportFromMap(map: AMapMap): MapViewport | null {
  const bounds = map.getBounds?.();
  const southWest = positionToLngLat(bounds?.getSouthWest?.());
  const northEast = positionToLngLat(bounds?.getNorthEast?.());
  const center = positionToLngLat(map.getCenter?.());
  const zoom = numberValue(map.getZoom?.());
  if (!southWest || !northEast || !center || zoom === null) return null;
  return { center, zoom, bounds: { southWest, northEast } };
}

function locationFromGeolocationResult(value: unknown): LngLat | null {
  const result = asObject(value);
  const position = asObject(result?.position);
  return positionToLngLat(position as AMapPosition | null);
}

function fitMapToPins(map: AMapMap, pins: readonly MapDiscoveryPlace[], padding: MapPadding) {
  if (pins.length === 1 && map.setZoomAndCenter) {
    const [place] = pins;
    map.setZoomAndCenter(15, [place.longitude, place.latitude]);
    return;
  }
  map.setFitView?.(undefined, false, [padding.top, padding.right, padding.bottom, padding.left], 15);
}

function applyMapPadding(map: AMapMap, padding: MapPadding) {
  map.setPadding?.([padding.top, padding.right, padding.bottom, padding.left]);
}

function pixelCoordinate(value: { getX?: () => number; getY?: () => number; x?: number; y?: number } | null | undefined) {
  if (!value) return null;
  const x = numberValue(typeof value.getX === "function" ? value.getX() : value.x);
  const y = numberValue(typeof value.getY === "function" ? value.getY() : value.y);
  return x === null || y === null ? null : { x, y };
}

export function DynamicMapAdapter({
  apiKey,
  pins,
  selectedPlaceId,
  userLocation,
  retryGeneration = 0,
  locateRequest = 0,
  fitRequestKey = "",
  restoreViewport,
  padding = { top: 32, right: 24, bottom: 260, left: 24 },
  onReady,
  onViewportSettled,
  onSelectPlace,
  onClearSelection,
  onClusterOpened,
  onLocationResult,
  onLocationError,
  onFatalError,
}: MapAdapterProps) {
  const paddingTop = padding.top;
  const paddingRight = padding.right;
  const paddingBottom = padding.bottom;
  const paddingLeft = padding.left;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const clusterRef = useRef<AMapCluster | null>(null);
  const userMarkerRef = useRef<AMapMarker | null>(null);
  const markerByPlaceIdRef = useRef(new Map<string, AMapMarker>());
  const latestPinsRef = useRef(pins);
  const coordinateBucketsRef = useRef(buildMapCoordinateBuckets(pins));
  const selectedPlaceIdRef = useRef(selectedPlaceId);
  const restoreViewportRef = useRef(restoreViewport);
  const callbacksRef = useRef({ onReady, onViewportSettled, onSelectPlace, onClearSelection, onClusterOpened, onLocationResult, onLocationError, onFatalError });
  const paddingRef = useRef(padding);
  const lastLocateRequestRef = useRef(locateRequest);
  const pinSignature = useMemo(() => pins.map((place) => `${place.id}:${place.longitude}:${place.latitude}:${place.bowlStrength ?? 0}`).join("|"), [pins]);

  useEffect(() => {
    latestPinsRef.current = pins;
    coordinateBucketsRef.current = buildMapCoordinateBuckets(pins);
    selectedPlaceIdRef.current = selectedPlaceId;
    callbacksRef.current = { onReady, onViewportSettled, onSelectPlace, onClearSelection, onClusterOpened, onLocationResult, onLocationError, onFatalError };
    paddingRef.current = padding;
    restoreViewportRef.current = restoreViewport;
  }, [onClearSelection, onClusterOpened, onFatalError, onLocationError, onLocationResult, onReady, onSelectPlace, onViewportSettled, padding, pins, restoreViewport, selectedPlaceId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let completeTimer = 0;
    let viewportTimer = 0;
    let map: AMapMap | null = null;
    let fatalNotified = false;
    let clusterClickHandler: AMapEventHandler | undefined;
    let mapClickHandler: AMapEventHandler | undefined;
    const boundMarkerClicks = new WeakSet<AMapMarker>();
    const mappingFailedMarkers = new WeakSet<AMapMarker>();
    const markerByPlaceId = markerByPlaceIdRef.current;

    const notifyViewport = () => {
      if (disposed || !map) return;
      window.clearTimeout(viewportTimer);
      viewportTimer = window.setTimeout(() => {
        const viewport = map ? viewportFromMap(map) : null;
      if (viewport) callbacksRef.current.onViewportSettled?.(viewport);
      }, 120);
    };

    const handleComplete = () => {
      if (disposed || !map) return;
      window.clearTimeout(completeTimer);
      const inset = paddingRef.current;
      applyMapPadding(map, inset);
      if (restoreViewportRef.current) {
        const restored = restoreViewportRef.current;
        map.setZoomAndCenter?.(restored.zoom, [restored.center.longitude, restored.center.latitude]);
      } else if (latestPinsRef.current.length) fitMapToPins(map, latestPinsRef.current, inset);
      callbacksRef.current.onReady?.();
      notifyViewport();
    };

    const notifyFatal = (failure: MapFailure) => {
      if (disposed || fatalNotified) return;
      fatalNotified = true;
      callbacksRef.current.onFatalError?.(failure);
    };

    const initialize = async () => {
      try {
        reportClientMetric("amap_load_started", 1, undefined, { outcome: "success" });
        const amap = await loadAmap(apiKey, ["AMap.MarkerCluster", "AMap.Geolocation"]) as AMapNamespace;
        if (disposed) return;
        amapRef.current = amap;
        const firstPin = latestPinsRef.current[0];
        map = new amap.Map(container, {
          zoom: firstPin ? 11 : 10,
          center: firstPin ? [firstPin.longitude, firstPin.latitude] : [116.397428, 39.90923],
          viewMode: "2D",
          resizeEnable: true,
          zooms: [3, 19],
          dragEnable: true,
          zoomEnable: true,
          touchZoom: true,
          rotateEnable: false,
          pitchEnable: false,
          showIndoorMap: false,
          isHotspot: false,
          mapStyle: "amap://styles/whitesmoke",
        });
        mapRef.current = map;
        map.on("complete", handleComplete);
        map.on("moveend", notifyViewport);
        map.on("zoomend", notifyViewport);
        mapClickHandler = (...args: unknown[]) => {
          const event = asObject(args[0]);
          const target = asObject(event?.target);
          const domTarget = typeof EventTarget !== "undefined" && event?.target instanceof EventTarget ? event.target : null;
          if (domTarget instanceof HTMLElement && domTarget.closest(".foodprint-map-pin")) return;
          if (target && (typeof target.getExtData === "function" || Array.isArray(asObject(target.extData)?.clusterPlaceIds))) return;
          callbacksRef.current.onClearSelection?.();
        };
        map.on("click", mapClickHandler);

        const reportPinMappingFailure = (marker: AMapMarker) => {
          if (mappingFailedMarkers.has(marker)) return;
          mappingFailedMarkers.add(marker);
          marker.setMap?.(null);
          reportClientMetric("map_pin_mapping_failed", 1, "error", { outcome: "error" });
          notifyFatal(mapFailure("runtime", "pin_mapping_failed", false));
        };

        const resolveMarkerIndex = (context: ClusterContext, marker: AMapMarker) => {
          const position = positionToLngLat(marker.getPosition?.());
          const values = [context.data, context.marker, marker.getExtData?.()];
          for (const value of values) {
            const index = resolveMapPlaceIndex(value, latestPinsRef.current, coordinateBucketsRef.current, position);
            if (index !== null) return index;
          }
          return null;
        };

        const markerOptions = {
          gridSize: 64,
          maxZoom: 17,
          renderMarker: (rawContext: unknown) => {
            const context = readClusterContext(rawContext);
            const marker = markerList(context.marker)[0];
            if (!marker) return;
            const index = resolveMarkerIndex(context, marker);
            const place = index === null ? undefined : latestPinsRef.current[index];
            if (!place) {
              reportPinMappingFailure(marker);
              return;
            }
            const selected = place.id === selectedPlaceIdRef.current;
            const level = toMapPinRecommendationLevel(place.bowlStrength);
            marker.setContent?.(createMapPinElement({ level, selected, accessibleLabel: `查看 ${place.name}` }));
            const pinOffset = mapPinPixelOffset(selected ? 48 : 40, selected ? 54 : 45);
            marker.setOffset?.(new amap.Pixel(pinOffset.x, pinOffset.y));
            marker.setExtData?.({ foodprintMapPin: true, placeIndex: index, placeId: place.id });
            marker.setZIndex?.(selected ? 300 : 100 + level);
            markerByPlaceIdRef.current.set(place.id, marker);
            if (!boundMarkerClicks.has(marker)) {
              boundMarkerClicks.add(marker);
              marker.on?.("click", () => callbacksRef.current.onSelectPlace?.(place.id));
            }
          },
          renderClusterMarker: (rawContext: unknown) => {
            const context = readClusterContext(rawContext);
            const marker = markerList(context.marker)[0];
            if (!marker) return;
            const placeIds = readClusterPlaceIds(context, latestPinsRef.current);
            const selected = Boolean(selectedPlaceIdRef.current && placeIds.includes(selectedPlaceIdRef.current));
            const count = readClusterCount(context);
            marker.setContent?.(createMapClusterElement({ count, active: selected }));
            const clusterOffset = mapPinPixelOffset(selected ? 48 : 44, selected ? 54 : 50);
            marker.setOffset?.(new amap.Pixel(clusterOffset.x, clusterOffset.y));
            marker.setExtData?.({ foodprintMapCluster: true, clusterPlaceIds: placeIds });
          },
        };
        clusterRef.current = new amap.MarkerCluster(map, [], markerOptions);
        clusterClickHandler = (rawEvent: unknown) => {
          const context = readClusterEventContext(rawEvent);
          const clusterMarker = markerList(context.marker)[0];
          const currentZoom = map?.getZoom?.();
          if (currentZoom !== undefined && currentZoom < 17 && map?.setZoomAndCenter) {
            const position = positionToLngLat(clusterMarker?.getPosition?.()) ?? positionToLngLat(map.getCenter?.());
            if (position) {
              map.setZoomAndCenter(Math.min(17, currentZoom + 2), [position.longitude, position.latitude]);
              return;
            }
          }
          const ids = readClusterPlaceIds(context, latestPinsRef.current);
          if (ids.length > 0) callbacksRef.current.onClusterOpened?.(ids);
          else if (map?.getZoom && map.setZoomAndCenter && map.getCenter) {
            const center = positionToLngLat(map.getCenter());
            if (center && map.getZoom() < 18) map.setZoomAndCenter(Math.min(18, map.getZoom() + 2), [center.longitude, center.latitude]);
            else {
              reportClientMetric("map_pin_mapping_failed", 1, "error", { outcome: "error" });
              notifyFatal(mapFailure("runtime", "pin_mapping_failed", false));
            }
          } else {
            reportClientMetric("map_pin_mapping_failed", 1, "error", { outcome: "error" });
            notifyFatal(mapFailure("runtime", "pin_mapping_failed", false));
          }
        };
        clusterRef.current.on?.("click", clusterClickHandler);
        clusterRef.current.setData(createMapPinData(latestPinsRef.current).map((data) => ({
          ...data,
          weight: 1,
        })));
        applyMapPadding(map, paddingRef.current);
        if (restoreViewportRef.current) {
          const restored = restoreViewportRef.current;
          map.setZoomAndCenter?.(restored.zoom, [restored.center.longitude, restored.center.latitude]);
        } else {
          fitMapToPins(map, latestPinsRef.current, paddingRef.current);
        }
        window.clearTimeout(completeTimer);
        completeTimer = window.setTimeout(() => {
          notifyFatal(mapFailure("map_complete", "complete_timeout"));
        }, 8_000);
      } catch (error) {
        notifyFatal(mapFailureFromUnknown(error, "sdk_load"));
      }
    };

    void initialize();
    return () => {
      disposed = true;
      window.clearTimeout(completeTimer);
      window.clearTimeout(viewportTimer);
      if (map && mapClickHandler) map.off?.("click", mapClickHandler);
      if (clusterRef.current && clusterClickHandler) clusterRef.current.off?.("click", clusterClickHandler);
      clusterRef.current?.setMap?.(null);
      clusterRef.current = null;
      userMarkerRef.current?.setMap?.(null);
      userMarkerRef.current = null;
      markerByPlaceId.clear();
      mapRef.current?.destroy?.();
      mapRef.current = null;
      amapRef.current = null;
    };
  }, [apiKey, retryGeneration]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    markerByPlaceIdRef.current.clear();
    cluster.setData(createMapPinData(latestPinsRef.current).map((data) => ({
      ...data,
      weight: 1,
    })));
  }, [pinSignature]);

  useEffect(() => {
    const map = mapRef.current;
    const amap = amapRef.current;
    if (!map || !amap || !userLocation) {
      userMarkerRef.current?.setMap?.(null);
      userMarkerRef.current = null;
      return;
    }
    userMarkerRef.current?.setMap?.(null);
    userMarkerRef.current = new amap.Marker({
      map,
      position: [userLocation.longitude, userLocation.latitude],
      content: createMapUserLocationElement(),
      offset: new amap.Pixel(-22, -22),
      clickable: false,
      zIndex: 500,
    });
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitRequestKey) return;
    const inset = paddingRef.current;
    applyMapPadding(map, inset);
    fitMapToPins(map, latestPinsRef.current, inset);
  }, [fitRequestKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !latestPinsRef.current.length) return;
    const inset = { top: paddingTop, right: paddingRight, bottom: paddingBottom, left: paddingLeft };
    applyMapPadding(map, inset);
    if (!restoreViewportRef.current) fitMapToPins(map, latestPinsRef.current, inset);
  }, [paddingBottom, paddingLeft, paddingRight, paddingTop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !restoreViewport) return;
    applyMapPadding(map, paddingRef.current);
    map.setZoomAndCenter?.(restoreViewport.zoom, [restoreViewport.center.longitude, restoreViewport.center.latitude]);
  }, [restoreViewport, restoreViewport?.center.latitude, restoreViewport?.center.longitude, restoreViewport?.zoom]);

  useEffect(() => {
    const selected = selectedPlaceIdRef.current;
    markerByPlaceIdRef.current.forEach((marker, placeId) => {
      const place = latestPinsRef.current.find((candidate) => candidate.id === placeId);
      if (!place) return;
      const isSelected = placeId === selected;
      const amap = amapRef.current;
      marker.setContent?.(createMapPinElement({ level: toMapPinRecommendationLevel(place.bowlStrength), selected: isSelected, accessibleLabel: `查看 ${place.name}` }));
      if (amap) {
        const pinOffset = mapPinPixelOffset(isSelected ? 48 : 40, isSelected ? 54 : 45);
        marker.setOffset?.(new amap.Pixel(pinOffset.x, pinOffset.y));
      }
      marker.setZIndex?.(isSelected ? 300 : 100 + toMapPinRecommendationLevel(place.bowlStrength));
    });
    const selectedPlace = selected ? latestPinsRef.current.find((place) => place.id === selected) : undefined;
    const map = mapRef.current;
    if (selectedPlace && map) {
      const pixel = map.lngLatToContainer?.([selectedPlace.longitude, selectedPlace.latitude]);
      const position = pixelCoordinate(pixel);
      const availableHeight = Math.max(0, (containerRef.current?.clientHeight ?? 0) - padding.bottom);
      if (position && map.panBy && availableHeight > 0) {
        const desiredY = Math.max(padding.top + 36, Math.min(availableHeight - 24, availableHeight * 0.44));
        const deltaY = desiredY - position.y;
        if (Math.abs(deltaY) > 16) map.panBy(0, deltaY);
      } else map.panTo?.([selectedPlace.longitude, selectedPlace.latitude]);
    }
  }, [padding.bottom, padding.top, pinSignature, selectedPlaceId]);

  useEffect(() => {
    if (locateRequest <= 0 || locateRequest === lastLocateRequestRef.current) return;
    lastLocateRequestRef.current = locateRequest;
    const map = mapRef.current;
    const amap = amapRef.current;
    if (!map || !amap) {
      callbacksRef.current.onLocationError?.(mapFailure("runtime", "runtime_unrecoverable"));
      return;
    }
    const request = () => {
      try {
        const geolocation = new amap.Geolocation({
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 300_000,
          convert: true,
          showButton: false,
          showMarker: false,
          showCircle: false,
          panToLocation: false,
          zoomToAccuracy: false,
        });
        geolocation.getCurrentPosition((status, result) => {
          const location = status === "complete" ? locationFromGeolocationResult(result) : null;
          if (location) callbacksRef.current.onLocationResult?.(location);
          else callbacksRef.current.onLocationError?.(mapFailure("runtime", "provider_timeout"));
        });
      } catch (error) {
        callbacksRef.current.onLocationError?.(mapFailureFromUnknown(error, "runtime"));
      }
    };
    if (map.plugin) map.plugin(["AMap.Geolocation"], request);
    else request();
  }, [locateRequest]);

  return <div ref={containerRef} className="dynamic-map-canvas" aria-label="动态地图" role="application" />;
}

export type { MapAdapterProps };
