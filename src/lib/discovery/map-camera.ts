export type MapCameraIntent =
  | "provider_fallback"
  | "fit_all"
  | "auto_location"
  | "return_state"
  | "explicit_search"
  | "manual_locate"
  | "manual";

export type MapCameraRequest = {
  id: string;
  intent: MapCameraIntent;
  /** Explicit UI commands may supersede an older manual camera state. */
  userInitiated: boolean;
};

const CAMERA_INTENT_PRIORITY: Record<MapCameraIntent, number> = {
  provider_fallback: 10,
  fit_all: 20,
  auto_location: 30,
  return_state: 40,
  explicit_search: 50,
  manual_locate: 60,
  manual: 70,
};

export function cameraIntentPriority(intent: MapCameraIntent) {
  return CAMERA_INTENT_PRIORITY[intent];
}

/** A lower-priority delayed callback cannot steal the user's current camera. */
export function shouldApplyCameraIntent(current: MapCameraIntent | null, next: MapCameraIntent) {
  return current === null || cameraIntentPriority(next) >= cameraIntentPriority(current);
}

export type CameraIntentState = { intent: MapCameraIntent | null; sequence: number };

export function reduceCameraIntent(state: CameraIntentState, next: MapCameraIntent): CameraIntentState {
  return shouldApplyCameraIntent(state.intent, next)
    ? { intent: next, sequence: state.sequence + 1 }
    : state;
}
