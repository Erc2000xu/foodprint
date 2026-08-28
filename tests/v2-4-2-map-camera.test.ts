import { describe, expect, it } from "vitest";
import { amapOneShotLocationOptions, shouldApplyLocatedCamera } from "@/lib/amap/location-options";
import { cameraIntentPriority, reduceCameraIntent, shouldApplyCameraIntent } from "@/lib/discovery/map-camera";

describe("V2.4.2 deterministic map camera priority", () => {
  it("orders manual gesture, manual locate, explicit intent, return, auto, fit, fallback", () => {
    expect(cameraIntentPriority("manual")).toBeGreaterThan(cameraIntentPriority("manual_locate"));
    expect(cameraIntentPriority("manual_locate")).toBeGreaterThan(cameraIntentPriority("explicit_search"));
    expect(cameraIntentPriority("explicit_search")).toBeGreaterThan(cameraIntentPriority("return_state"));
    expect(cameraIntentPriority("return_state")).toBeGreaterThan(cameraIntentPriority("auto_location"));
    expect(cameraIntentPriority("auto_location")).toBeGreaterThan(cameraIntentPriority("fit_all"));
    expect(cameraIntentPriority("fit_all")).toBeGreaterThan(cameraIntentPriority("provider_fallback"));
  });

  it("rejects a delayed lower-priority callback and advances accepted requests", () => {
    expect(shouldApplyCameraIntent("manual", "auto_location")).toBe(false);
    expect(shouldApplyCameraIntent("return_state", "explicit_search")).toBe(true);
    expect(reduceCameraIntent({ intent: "manual_locate", sequence: 2 }, "fit_all")).toEqual({ intent: "manual_locate", sequence: 2 });
    expect(reduceCameraIntent({ intent: "auto_location", sequence: 1 }, "manual_locate")).toEqual({ intent: "manual_locate", sequence: 2 });
  });

  it("keeps the AMap contract foreground-only and drops a stale location camera", () => {
    expect(amapOneShotLocationOptions).toMatchObject({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000, convert: true, panToLocation: false, zoomToAccuracy: false });
    expect("watchPosition" in amapOneShotLocationOptions).toBe(false);
    expect(shouldApplyLocatedCamera({ requestGeneration: 3, currentGeneration: 4, currentIntent: "auto_location", requestedIntent: "auto_location" })).toBe(false);
    expect(shouldApplyLocatedCamera({ requestGeneration: 3, currentGeneration: 3, currentIntent: "manual", requestedIntent: "auto_location" })).toBe(false);
    expect(shouldApplyLocatedCamera({ requestGeneration: 3, currentGeneration: 3, currentIntent: "auto_location", requestedIntent: "manual_locate" })).toBe(true);
    expect(shouldApplyLocatedCamera({ requestGeneration: 3, currentGeneration: 3, requestedCameraRequestId: "auto-1", currentCameraRequestId: "search-2", currentIntent: "fit_all", requestedIntent: "auto_location" })).toBe(false);
  });
});
