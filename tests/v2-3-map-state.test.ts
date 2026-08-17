import { describe, expect, it } from "vitest";
import { discoveryViewFromParams, mapModeReducer } from "@/lib/discovery/map-state";
import { initialViewportSheetState, viewportSheetReducer } from "@/components/map/viewport-place-sheet-reducer";

describe("V2.3 map and sheet state", () => {
  it("defaults to map only when the feature and complete data are both ready", () => {
    expect(discoveryViewFromParams(new URLSearchParams(), true, true)).toBe("map");
    expect(discoveryViewFromParams(new URLSearchParams("view=list"), true, true)).toBe("list");
    expect(discoveryViewFromParams(new URLSearchParams("view=map"), false, true)).toBe("list");
    expect(discoveryViewFromParams(new URLSearchParams(), true, false)).toBe("list");
  });

  it("does not let stale map events reopen the map after a newer retry", () => {
    const loading = mapModeReducer({ kind: "map-loading", retryGeneration: 2 }, { type: "OPEN_MAP", retryGeneration: 2 });
    expect(mapModeReducer(loading, { type: "MAP_READY", retryGeneration: 1 })).toEqual(loading);
    expect(mapModeReducer(loading, { type: "MAP_FATAL", retryGeneration: 2, failure: { stage: "sdk_load", code: "sdk_rejected", retryable: true } })).toEqual({ kind: "list", reason: "map-failure" });
  });

  it("uses the three business-semantic sheet states", () => {
    const selected = viewportSheetReducer(initialViewportSheetState, { type: "SELECT_PLACE", placeId: "place-1" });
    expect(selected).toEqual({ status: "place_preview", selectedPlaceId: "place-1" });
    expect(viewportSheetReducer(selected, { type: "OPEN_VIEWPORT_LIST" })).toEqual({ status: "viewport_list", selectedPlaceId: "place-1" });
    expect(viewportSheetReducer({ status: "viewport_list", selectedPlaceId: "place-1" }, { type: "ESCAPE" })).toEqual(selected);
    expect(viewportSheetReducer({ status: "viewport_list" }, { type: "ESCAPE" })).toEqual({ status: "summary" });
    expect(viewportSheetReducer(selected, { type: "ESCAPE" })).toEqual({ status: "summary" });
    expect(viewportSheetReducer(selected, { type: "FILTER_CHANGED", selectedPlaceStillVisible: false })).toEqual({ status: "summary" });
    expect(viewportSheetReducer(initialViewportSheetState, { type: "RESTORE_RETURN_STATE", status: "place_preview", selectedPlaceId: "place-2" })).toEqual({ status: "place_preview", selectedPlaceId: "place-2" });
  });
});
