export type ViewportSheetStatus = "summary" | "place_preview" | "viewport_list";
export type ViewportSheetDetent = ViewportSheetStatus;

export type ViewportSheetState = {
  status: ViewportSheetStatus;
  selectedPlaceId?: string;
};

export type ViewportSheetAction =
  | { type: "SELECT_PLACE"; placeId: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "OPEN_VIEWPORT_LIST" }
  | { type: "COLLAPSE_SHEET" }
  | { type: "FILTER_CHANGED"; selectedPlaceStillVisible: boolean }
  | { type: "RESTORE_RETURN_STATE"; status: ViewportSheetStatus; selectedPlaceId?: string }
  | { type: "SET_STATUS"; status: ViewportSheetStatus }
  | { type: "ESCAPE" };

export const initialViewportSheetState: ViewportSheetState = { status: "summary" };

function statusWithSelection(status: ViewportSheetStatus, selectedPlaceId?: string): ViewportSheetState {
  if (status === "place_preview" && !selectedPlaceId) return { status: "summary" };
  return selectedPlaceId ? { status, selectedPlaceId } : { status };
}

export function viewportSheetReducer(state: ViewportSheetState, action: ViewportSheetAction): ViewportSheetState {
  switch (action.type) {
    case "SELECT_PLACE":
      return { status: "place_preview", selectedPlaceId: action.placeId };
    case "CLEAR_SELECTION":
      return state.status === "viewport_list" ? { status: "viewport_list" } : { status: "summary" };
    case "OPEN_VIEWPORT_LIST":
      return statusWithSelection("viewport_list", state.selectedPlaceId);
    case "COLLAPSE_SHEET":
      if (state.status === "viewport_list") return statusWithSelection(state.selectedPlaceId ? "place_preview" : "summary", state.selectedPlaceId);
      if (state.status === "place_preview") return { status: "summary" };
      return state;
    case "FILTER_CHANGED":
      return action.selectedPlaceStillVisible ? state : { status: "summary" };
    case "RESTORE_RETURN_STATE":
      return statusWithSelection(action.status, action.selectedPlaceId);
    case "SET_STATUS":
      return statusWithSelection(action.status, state.selectedPlaceId);
    case "ESCAPE":
      if (state.status === "viewport_list") return statusWithSelection(state.selectedPlaceId ? "place_preview" : "summary", state.selectedPlaceId);
      if (state.status === "place_preview") return { status: "summary" };
      return state;
    default:
      return state;
  }
}
