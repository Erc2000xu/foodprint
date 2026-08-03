/**
 * Keep provider, database, and RPC details in server logs rather than putting
 * implementation errors in the interface. Domain-specific actions can pass a
 * safer fallback when they have a more precise user-facing state.
 */
export function userFacingError(error: unknown, fallback = "操作没有完成，请再试一次。") {
  const raw = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : error instanceof Error
      ? error.message
      : typeof error === "string" ? error : "";
  const normalized = raw.toLowerCase();

  if (/(not authenticated|unauthorized|jwt|session|登录|未登录)/.test(normalized)) return "请先登录后再继续。";
  if (/(not a member|membership|group member|共同地图|group access)/.test(normalized)) return "你还没有加入共同地图。";
  if (/(network|fetch|timeout|timed out|连接|网络)/.test(normalized)) return "网络有点忙，请稍后再试。";
  if (/(map|static map|amap|地图)/.test(normalized)) return "地图暂时没有响应，请稍后再试。";
  if (/(poi|place|地点|search)/.test(normalized)) return "地点搜索暂时没有响应，请稍后再试。";

  if (process.env.NODE_ENV !== "test" && raw) console.error("Foodprint operation failed", error);
  return fallback;
}
