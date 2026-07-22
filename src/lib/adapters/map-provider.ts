import type { Coordinates } from "./place-repository";

export type MapMarker = {
  id: string;
  coordinates: Coordinates;
  label?: string;
};

export interface MapController {
  setMarkers(markers: MapMarker[]): void;
  focus(coordinates: Coordinates): void;
  destroy(): void;
}

/** Browser-only map boundary. Concrete AMap code must not leak into features. */
export interface MapProvider {
  mount(container: HTMLElement, initialCenter: Coordinates): Promise<MapController>;
}
