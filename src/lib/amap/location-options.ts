import { shouldApplyCameraIntent, type MapCameraIntent } from "@/lib/discovery/map-camera";

/** V2.4.2 uses one foreground request; it never starts watchPosition. */
export const amapOneShotLocationOptions: Record<string, boolean | number> = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
  convert: true,
  showButton: false,
  showMarker: false,
  showCircle: false,
  panToLocation: false,
  zoomToAccuracy: false,
};

export function shouldApplyLocatedCamera(input: {
  requestGeneration: number;
  currentGeneration: number;
  requestedCameraRequestId?: string;
  currentCameraRequestId?: string;
  currentIntent: MapCameraIntent | null;
  requestedIntent: MapCameraIntent;
}) {
  return input.requestGeneration === input.currentGeneration
    && input.requestedCameraRequestId === input.currentCameraRequestId
    && shouldApplyCameraIntent(input.currentIntent, input.requestedIntent);
}
