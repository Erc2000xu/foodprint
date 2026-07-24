"use client";

import { StaticAmapMap } from "@/components/map/static-amap-map";
import type { MapPlace } from "@/components/map/amap-map";

export type MapViewport = { longitude: number; latitude: number; zoom: number };
export type MapPin = Pick<MapPlace, "id" | "name" | "longitude" | "latitude" | "averageRating" | "markCount">;
export type MapAdapterProps = {
  pins: MapPin[];
  viewport?: MapViewport;
  selectedPlaceId?: string;
  onSelectPlace?: (placeId: string) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  onLocate?: () => void;
  onError?: (error: Error) => void;
};

/**
 * The V1 implementation deliberately uses the protected static-map function.
 * Its public contract is kept identical to the future interactive AMap adapter,
 * so list/search state is not coupled to the current fallback.
 */
export function StaticMapAdapter({ pins, onError }: MapAdapterProps) {
  return <StaticAmapMap places={pins as MapPlace[]} onError={onError} />;
}
