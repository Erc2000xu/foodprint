export type MapFailureStage =
  | "disabled"
  | "configuration"
  | "sdk_load"
  | "security_proxy"
  | "map_complete"
  | "runtime";

export type MapFailureCode =
  | "missing_public_key"
  | "missing_security_key"
  | "origin_rejected"
  | "rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "sdk_rejected"
  | "complete_timeout"
  | "pin_mapping_failed"
  | "runtime_unrecoverable"
  | "unknown";

export type MapFailure = {
  stage: MapFailureStage;
  code: MapFailureCode;
  retryable: boolean;
};

export function mapFailure(
  stage: MapFailureStage,
  code: MapFailureCode,
  retryable = true,
): MapFailure {
  return { stage, code, retryable };
}

export function mapFailureFromUnknown(error: unknown, stage: MapFailureStage): MapFailure {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout")) return mapFailure(stage, "provider_timeout");
  if (message.includes("403") || message.includes("origin")) return mapFailure("security_proxy", "origin_rejected", false);
  if (message.includes("429")) return mapFailure("security_proxy", "rate_limited", false);
  if (message.includes("security") || message.includes("jscode")) return mapFailure("security_proxy", "missing_security_key", false);
  if (stage === "sdk_load") return mapFailure(stage, "sdk_rejected");
  if (stage === "map_complete") return mapFailure(stage, "complete_timeout");
  return mapFailure(stage, "unknown");
}

export function mapFailureMessage(failure: MapFailure) {
  if (failure.code === "complete_timeout" || failure.code === "provider_timeout") return "地图暂时没打开，已为你切换到列表。";
  return "地图暂时没打开，已为你切换到列表。";
}
