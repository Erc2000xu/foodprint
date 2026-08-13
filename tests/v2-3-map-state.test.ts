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

  it("opens a selected place in the card sheet and preserves the four detents", () => {
    const selected = viewportSheetReducer(initialViewportSheetState, { type: "SELECT_PLACE", placeId: "place-1" });
    expect(selected).toEqual({ detent: "card", selectedPlaceId: "place-1" });
    expect(viewportSheetReducer({ ...selected, detent: "half" }, { type: "ESCAPE" })).toEqual({ detent: "card", selectedPlaceId: "place-1" });
    expect(viewportSheetReducer({ detent: "expanded" }, { type: "ESCAPE" })).toEqual({ detent: "half" });
    expect(viewportSheetReducer(selected, { type: "ESCAPE" })).toEqual({ detent: "peek" });
  });
});
