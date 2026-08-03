export type AmapFailureCategory = "network_failure" | "origin_rejected" | "provider_timeout" | "provider_auth_failure" | "provider_unavailable";

const messages: Record<AmapFailureCategory, string> = {
  network_failure: "网络有点忙，请稍后再试。",
  origin_rejected: "地图暂时没有响应，请稍后再试。",
  provider_timeout: "地点搜索暂时没有响应，请稍后再试。",
  provider_auth_failure: "地图服务配置需要处理，请稍后再试。",
  provider_unavailable: "地点搜索暂时没有响应，请稍后再试。",
};

export function amapFailureMessage(category: unknown, fallback = "地点搜索暂时没有响应，请稍后再试。") {
  return typeof category === "string" && category in messages ? messages[category as AmapFailureCategory] : fallback;
}
