"use client";

import { useCallback, useEffect, useRef } from "react";
import { loadAmap } from "@/lib/amap/load-amap";
import { amapOneShotLocationOptions } from "@/lib/amap/location-options";
import { mapFailure, mapFailureFromUnknown, type MapFailure } from "@/lib/amap/map-failure";
import type { ParkingCoordinate, ParkingCoordinates, ParkingMark, ParkingGeometryType, ParkingViewport } from "@/lib/parking/types";

type AMapEventHandler = (...args: unknown[]) => void;
type AMapPosition = { getLng?: () => number; getLat?: () => number; lng?: number; lat?: number };
type AMapBounds = { getSouthWest?: () => AMapPosition; getNorthEast?: () => AMapPosition };
type AMapOverlay = { setMap?: (map: AMapMap | null) => void; on?: (event: string, handler: AMapEventHandler) => void; off?: (event: string, handler: AMapEventHandler) => void; getExtData?: () => unknown; extData?: unknown };
type AMapMap = {
  on: (event: string, handler: AMapEventHandler) => void;
  off?: (event: string, handler: AMapEventHandler) => void;
  getBounds?: () => AMapBounds;
  getCenter?: () => AMapPosition;
  getZoom?: () => number;
  setZoomAndCenter?: (zoom: number, center: number[]) => void;
  setPadding?: (padding: [number, number, number, number]) => void;
  plugin?: (plugins: string[], callback: () => void) => void;
  destroy?: () => void;
};
type AMapGeolocation = { getCurrentPosition: (callback: (status: string, result: unknown) => void) => void };
type AMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapOverlay;
  Polyline: new (options: Record<string, unknown>) => AMapOverlay;
  Polygon: new (options: Record<string, unknown>) => AMapOverlay;
  Pixel: new (x: number, y: number) => unknown;
  Geolocation: new (options: Record<string, unknown>) => AMapGeolocation;
};

type ParkingPreview = { geometryType: ParkingGeometryType; coordinates: ParkingCoordinates } | null;

export type ParkingMapAdapterProps = {
  apiKey: string;
  marks: ParkingMark[];
  selectedMarkId?: string;
  preview?: ParkingPreview;
  initialViewport?: ParkingViewport;
  retryGeneration?: number;
  mapBottomPadding?: number;
  locateRequest?: number;
  onReady?: () => void;
  onViewportSettled?: (viewport: ParkingViewport) => void;
  onSelectMark?: (markId: string) => void;
  onClearSelection?: () => void;
  onLocationResult?: (coordinate: ParkingCoordinate) => void;
  onLocationError?: (failure: MapFailure) => void;
  onFatalError?: (failure: MapFailure) => void;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positionToCoordinate(value: AMapPosition | null | undefined): ParkingCoordinate | null {
  if (!value) return null;
  const longitude = numberValue(typeof value.getLng === "function" ? value.getLng() : value.lng);
  const latitude = numberValue(typeof value.getLat === "function" ? value.getLat() : value.lat);
  return longitude === null || latitude === null ? null : [longitude, latitude];
}

function viewportFromMap(map: AMapMap): ParkingViewport | null {
  const center = positionToCoordinate(map.getCenter?.());
  const zoom = numberValue(map.getZoom?.());
  if (!center || zoom === null) return null;
  return { center, zoom };
}

function coordinatePath(coordinates: ParkingCoordinates) {
  return (Array.isArray(coordinates[0]) ? coordinates : [coordinates]) as ParkingCoordinate[];
}

function coordinateCenter(mark: ParkingMark) {
  const path = coordinatePath(mark.coordinates);
  return path[0];
}

function createPointElement(mark: ParkingMark, selected: boolean) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `parking-map-point${selected ? " parking-map-point--selected" : ""}`;
  button.setAttribute("aria-label", `查看${mark.displayName}`);
  const image = document.createElement("img");
  image.src = "/icons/map-controls/motorcycle-parking-button-honey-v3.png";
  image.srcset = "/icons/map-controls/motorcycle-parking-button-honey-v3-1x.png 1x, /icons/map-controls/motorcycle-parking-button-honey-v3-2x.png 2x, /icons/map-controls/motorcycle-parking-button-honey-v3-3x.png 3x";
  image.sizes = "40px";
  image.width = 40;
  image.height = 40;
  image.alt = "";
  image.draggable = false;
  button.append(image);
  return button;
}

export function ParkingMapAdapter({
  apiKey,
  marks,
  selectedMarkId,
  preview = null,
  initialViewport,
  retryGeneration = 0,
  mapBottomPadding = 0,
  locateRequest = 0,
  onReady,
  onViewportSettled,
  onSelectMark,
  onClearSelection,
  onLocationResult,
  onLocationError,
  onFatalError,
}: ParkingMapAdapterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const overlaysRef = useRef<AMapOverlay[]>([]);
  const readyRef = useRef(false);
  const marksRef = useRef(marks);
  const selectedMarkIdRef = useRef(selectedMarkId);
  const previewRef = useRef<ParkingPreview>(preview);
  const initialViewportRef = useRef(initialViewport);
  const mapBottomPaddingRef = useRef(mapBottomPadding);
  const locateRequestRef = useRef(locateRequest);
  const callbacksRef = useRef({ onReady, onViewportSettled, onSelectMark, onClearSelection, onLocationResult, onLocationError, onFatalError });

  const notifyViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const viewport = viewportFromMap(map);
    if (viewport) callbacksRef.current.onViewportSettled?.(viewport);
  }, []);

  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
    overlaysRef.current = [];
  }, []);

  const addGeometry = useCallback((amap: AMapNamespace, map: AMapMap, geometryType: ParkingGeometryType, coordinates: ParkingCoordinates, mark?: ParkingMark) => {
    const path = coordinatePath(coordinates);
    const selected = Boolean(mark && mark.id === selectedMarkIdRef.current);
    if (geometryType === "point") {
      if (!mark) return;
      const point = path[0];
      if (!point) return;
      const marker = new amap.Marker({ map, position: point, content: mark ? createPointElement(mark, selected) : undefined, offset: new amap.Pixel(-20, -38), clickable: Boolean(mark), zIndex: selected ? 300 : 100, extData: mark ? { parkingMarkId: mark.id } : undefined });
      if (mark) marker.on?.("click", () => callbacksRef.current.onSelectMark?.(mark.id));
      overlaysRef.current.push(marker);
      return;
    }
    if (path.length < 2) return;
    const overlayOptions = {
      map,
      path,
      clickable: Boolean(mark),
      extData: mark ? { parkingMarkId: mark.id } : undefined,
      strokeColor: mark ? (selected ? "#ed7655" : "#0d5d58") : "#ed7655",
      strokeWeight: mark ? 5 : 4,
      strokeOpacity: mark ? 0.92 : 0.8,
      fillColor: geometryType === "area" ? (mark ? "#0d5d58" : "#ed7655") : undefined,
      fillOpacity: geometryType === "area" ? (mark ? 0.16 : 0.13) : undefined,
    };
    const overlay = geometryType === "line" ? new amap.Polyline(overlayOptions) : new amap.Polygon(overlayOptions);
    if (mark) overlay.on?.("click", () => callbacksRef.current.onSelectMark?.(mark.id));
    overlaysRef.current.push(overlay);
  }, []);

  const rebuildOverlays = useCallback(() => {
    const amap = amapRef.current;
    const map = mapRef.current;
    if (!amap || !map || !readyRef.current) return;
    clearOverlays();
    marksRef.current.forEach((mark) => addGeometry(amap, map, mark.geometryType, mark.coordinates, mark));
    const currentPreview = previewRef.current;
    if (currentPreview) addGeometry(amap, map, currentPreview.geometryType, currentPreview.coordinates);
  }, [addGeometry, clearOverlays]);

  useEffect(() => {
    marksRef.current = marks;
    selectedMarkIdRef.current = selectedMarkId;
    previewRef.current = preview;
    initialViewportRef.current = initialViewport;
    mapBottomPaddingRef.current = mapBottomPadding;
    callbacksRef.current = { onReady, onViewportSettled, onSelectMark, onClearSelection, onLocationResult, onLocationError, onFatalError };
    rebuildOverlays();
    mapRef.current?.setPadding?.([0, 0, mapBottomPadding, 0]);
  }, [initialViewport, mapBottomPadding, marks, onClearSelection, onFatalError, onLocationError, onLocationResult, onReady, onSelectMark, onViewportSettled, preview, rebuildOverlays, selectedMarkId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    readyRef.current = false;
    if (!apiKey) {
      callbacksRef.current.onFatalError?.(mapFailure("configuration", "missing_public_key", false));
      return;
    }
    let disposed = false;
    let map: AMapMap | null = null;
    let viewportTimer = 0;
    const onMove = () => {
      window.clearTimeout(viewportTimer);
      viewportTimer = window.setTimeout(notifyViewport, 90);
    };
    const onMapClick = (...args: unknown[]) => {
      const event = asObject(args[0]);
      const target = asObject(event?.target);
      const domTarget = typeof EventTarget !== "undefined" && event?.target instanceof EventTarget ? event.target : null;
      if (domTarget instanceof HTMLElement && domTarget.closest(".parking-map-point")) return;
      if (target && (typeof target.getExtData === "function" || asObject(target.extData)?.parkingMarkId)) return;
      callbacksRef.current.onClearSelection?.();
    };
    const initialize = async () => {
      try {
        const amap = await loadAmap(apiKey, ["AMap.Geolocation"]) as AMapNamespace;
        if (disposed) return;
        amapRef.current = amap;
        const firstMark = marksRef.current[0];
        const firstCoordinate = firstMark ? coordinateCenter(firstMark) : null;
        const viewport = initialViewportRef.current;
        map = new amap.Map(container, {
          zoom: viewport?.zoom ?? (firstCoordinate ? 15 : 11),
          center: viewport?.center ?? firstCoordinate ?? [116.397428, 39.90923],
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
        map.setPadding?.([0, 0, mapBottomPaddingRef.current, 0]);
        map.on("complete", () => {
          if (disposed) return;
          readyRef.current = true;
          rebuildOverlays();
          callbacksRef.current.onReady?.();
          notifyViewport();
        });
        map.on("moveend", onMove);
        map.on("zoomend", onMove);
        map.on("click", onMapClick);
      } catch (error) {
        callbacksRef.current.onFatalError?.(mapFailureFromUnknown(error, "sdk_load"));
      }
    };
    void initialize();
    return () => {
      disposed = true;
      window.clearTimeout(viewportTimer);
      if (map) {
        map.off?.("moveend", onMove);
        map.off?.("zoomend", onMove);
        map.off?.("click", onMapClick);
      }
      clearOverlays();
      map?.destroy?.();
      mapRef.current = null;
      amapRef.current = null;
      readyRef.current = false;
    };
  }, [apiKey, clearOverlays, notifyViewport, rebuildOverlays, retryGeneration]);

  useEffect(() => {
    if (locateRequest <= 0 || locateRequest === locateRequestRef.current) return;
    locateRequestRef.current = locateRequest;
    const map = mapRef.current;
    const amap = amapRef.current;
    if (!map || !amap) {
      callbacksRef.current.onLocationError?.(mapFailure("runtime", "runtime_unrecoverable"));
      return;
    }
    const request = () => {
      try {
        const geolocation = new amap.Geolocation({ ...amapOneShotLocationOptions });
        geolocation.getCurrentPosition((status, result) => {
          const object = asObject(result);
          const coordinate = positionToCoordinate(asObject(object?.position) as AMapPosition | null);
          if (status === "complete" && coordinate) {
            map.setZoomAndCenter?.(15, coordinate);
            callbacksRef.current.onLocationResult?.(coordinate);
            return;
          }
          const message = String(object?.info ?? object?.message ?? "").toLowerCase();
          callbacksRef.current.onLocationError?.(message.includes("denied") || message.includes("permission") ? mapFailure("runtime", "location_denied", false) : mapFailure("runtime", "location_unavailable"));
        });
      } catch (error) {
        callbacksRef.current.onLocationError?.(mapFailureFromUnknown(error, "runtime"));
      }
    };
    if (map.plugin) map.plugin(["AMap.Geolocation"], request);
    else request();
  }, [locateRequest]);

  return <div ref={containerRef} className="parking-map-canvas" aria-label="摩托车停车地图" role="application" />;
}
