import type { ParkingViewport } from "@/lib/parking/types";

export type ParkingNavigationViewport = Pick<ParkingViewport, "center" | "zoom">;

type ParkingNavigationState = {
  discoveryViewport?: ParkingNavigationViewport;
  parkingViewport?: ParkingNavigationViewport;
};

// Viewport state is deliberately memory-only. It helps a same-session return
// without putting precise map centers, parking coordinates, or notes in URLs,
// storage, cookies, logs, or any shared cache.
const navigationState = new Map<string, ParkingNavigationState>();

export function rememberParkingNavigationState(userId: string, next: Partial<ParkingNavigationState>) {
  const current = navigationState.get(userId) ?? {};
  navigationState.set(userId, { ...current, ...next });
}

export function readParkingNavigationState(userId: string) {
  return navigationState.get(userId);
}

export function clearParkingNavigationState(userId: string) {
  navigationState.delete(userId);
}
