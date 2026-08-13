import type { MapFailure } from "@/lib/amap/map-failure";

export type DiscoveryView = "map" | "list";

export type MapModeState =
  | { kind: "map-loading"; retryGeneration: number }
  | { kind: "map-ready"; retryGeneration: number }
  | { kind: "list"; reason: "user" | "map-failure" | "disabled" | "data-incomplete" };

export type MapModeAction =
  | { type: "OPEN_MAP"; retryGeneration?: number }
  | { type: "OPEN_LIST"; reason?: "user" | "map-failure" | "disabled" | "data-incomplete" }
  | { type: "MAP_READY"; retryGeneration: number }
  | { type: "MAP_FATAL"; retryGeneration: number; failure: MapFailure }
  | { type: "RETRY_MAP" }
  | { type: "DISABLE_MAP" };

export function mapModeReducer(state: MapModeState, action: MapModeAction): MapModeState {
  switch (action.type) {
    case "OPEN_MAP":
      return { kind: "map-loading", retryGeneration: action.retryGeneration ?? 0 };
    case "OPEN_LIST":
      return { kind: "list", reason: action.reason ?? "user" };
    case "MAP_READY":
      return state.kind === "map-loading" && state.retryGeneration === action.retryGeneration
        ? { kind: "map-ready", retryGeneration: action.retryGeneration }
        : state;
    case "MAP_FATAL":
      return state.kind === "map-loading" && state.retryGeneration === action.retryGeneration
        ? { kind: "list", reason: "map-failure" }
        : state;
    case "RETRY_MAP":
      return state.kind === "list" && state.reason === "map-failure"
        ? { kind: "map-loading", retryGeneration: 1 }
        : state;
    case "DISABLE_MAP":
      return { kind: "list", reason: "disabled" };
    default:
      return state;
  }
}

export function discoveryViewFromParams(params: URLSearchParams, mapEnabled: boolean, dataComplete: boolean): DiscoveryView {
  if (!mapEnabled || !dataComplete) return "list";
  return params.get("view") === "list" ? "list" : "map";
}
