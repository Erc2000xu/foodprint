export type ViewportSheetDetent = "peek" | "card" | "half" | "expanded";

export type ViewportSheetState = {
  detent: ViewportSheetDetent;
  selectedPlaceId?: string;
};

export type ViewportSheetAction =
  | { type: "SET_DETENT"; detent: ViewportSheetDetent }
  | { type: "SELECT_PLACE"; placeId: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "OPEN_EXPANDED" }
  | { type: "ESCAPE" };

export const initialViewportSheetState: ViewportSheetState = { detent: "peek" };

export function viewportSheetReducer(state: ViewportSheetState, action: ViewportSheetAction): ViewportSheetState {
  switch (action.type) {
    case "SET_DETENT":
      return action.detent === "peek"
        ? { detent: "peek" }
        : { ...state, detent: action.detent };
    case "SELECT_PLACE":
      return { detent: "card", selectedPlaceId: action.placeId };
    case "CLEAR_SELECTION":
      return { detent: "peek" };
    case "OPEN_EXPANDED":
      return { ...state, detent: "expanded", selectedPlaceId: undefined };
    case "ESCAPE":
      if (state.detent === "expanded") return { ...state, detent: "half" };
      if (state.detent === "half") return { ...state, detent: state.selectedPlaceId ? "card" : "peek" };
      return { detent: "peek" };
    default:
      return state;
  }
}
