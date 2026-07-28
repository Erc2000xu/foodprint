import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyProviderFailure, corsHeaders as buildCorsHeaders, isAllowedOrigin, isTimeoutError, logAmapEvent, parseAllowedOrigins, type AmapFailureCategory } from "../_shared/amap-reliability.ts";

const allowedOrigins = parseAllowedOrigins(Deno.env.get("APP_ALLOWED_ORIGINS"));

function corsHeaders(origin: string | null) {
  return buildCorsHeaders(origin, allowedOrigins, { methods: "POST, OPTIONS" });
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "content-type": "application/json; charset=utf-8" } });
}

function providerMessage(category: AmapFailureCategory) {
  return category === "provider_auth_failure" ? "地图服务配置需要处理，请稍后再试。" : "地图图片暂时无法生成，请使用列表浏览地点。";
}

function zoomFor(points: Array<{ longitude: number; latitude: number }>) {
  if (points.length <= 1) return 13;
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  const span = Math.max(Math.max(...longitudes) - Math.min(...longitudes), Math.max(...latitudes) - Math.min(...latitudes));
  if (span > 10) return 4;
  if (span > 3) return 6;
  if (span > 1) return 8;
  if (span > 0.3) return 10;
  return 12;
}

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    logAmapEvent({ operation: "static_map", outcome: "failure", durationMs: Date.now() - startedAt, category: "origin_rejected" });
    return json({ error: "地图服务正在更新，请稍后再试。", category: "origin_rejected" }, 403, origin);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return json({ error: "仅支持 POST 请求。" }, 405, origin);

  try {
    const authorization = request.headers.get("authorization");
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const amapKey = Deno.env.get("AMAP_WEBSERVICE_KEY");
    if (!authorization || !publishableKey || !supabaseUrl) return json({ error: "请先登录后查看共同地图。" }, 401, origin);
    if (!amapKey) {
      logAmapEvent({ operation: "static_map", outcome: "failure", durationMs: Date.now() - startedAt, category: "provider_auth_failure" });
      return json({ error: "地图服务配置需要处理，请稍后再试。", category: "provider_auth_failure" }, 503, origin);
    }

    const supabase = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "请先登录后查看共同地图。" }, 401, origin);
    const { data: memberships, error: membershipError } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
    if (membershipError) throw membershipError;
    const groupId = memberships?.[0]?.group_id;
    if (!groupId) return json({ error: "你尚未加入可用的共同地图。" }, 403, origin);

    const body = await request.json().catch(() => ({})) as { groupPlaceIds?: unknown };
    const requestedGroupPlaceIds = Array.isArray(body.groupPlaceIds)
      ? [...new Set(body.groupPlaceIds.filter((value): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{28}$/i.test(value)).slice(0, 12))]
      : [];
    let groupPlaceQuery = supabase.from("group_places").select("id, place_id").eq("group_id", groupId).eq("status", "active").limit(12);
    if (requestedGroupPlaceIds.length) groupPlaceQuery = groupPlaceQuery.in("id", requestedGroupPlaceIds);
    const { data: groupPlaces, error: groupPlaceError } = await groupPlaceQuery;
    if (groupPlaceError) throw groupPlaceError;
    const placeIds = groupPlaces?.map((place) => place.place_id) ?? [];
    if (!placeIds.length) return json({ error: "共同地图还没有地点。" }, 404, origin);
    const { data: places, error: placesError } = await supabase.from("places").select("id, latitude, longitude").in("id", placeIds);
    if (placesError) throw placesError;
    const points = (places ?? []).flatMap((place) => {
      const latitude = Number(place.latitude); const longitude = Number(place.longitude);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
    });
    if (!points.length) return json({ error: "地点缺少可用坐标。" }, 422, origin);

    const center = {
      longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
      latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    };
    const upstream = new URL("https://restapi.amap.com/v3/staticmap");
    upstream.searchParams.set("key", amapKey);
    upstream.searchParams.set("location", `${center.longitude},${center.latitude}`);
    upstream.searchParams.set("zoom", String(zoomFor(points)));
    upstream.searchParams.set("size", "750*520");
    upstream.searchParams.set("scale", "2");
    upstream.searchParams.set("markers", points.map((point, index) => `mid,,${index + 1}:${point.longitude},${point.latitude}`).join("|"));
    const upstreamResponse = await fetch(upstream, { signal: AbortSignal.timeout(10_000) });
    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    if (!upstreamResponse.ok || !contentType.startsWith("image/")) {
      const detail = await upstreamResponse.text().catch(() => "");
      const infocode = /"infocode"\s*:\s*"?([\w-]+)"?/.exec(detail)?.[1];
      const category = classifyProviderFailure(upstreamResponse.status, infocode);
      logAmapEvent({ operation: "static_map", outcome: "failure", durationMs: Date.now() - startedAt, category, upstreamStatus: upstreamResponse.status, infocode });
      return json({ error: providerMessage(category), category }, 502, origin);
    }
    logAmapEvent({ operation: "static_map", outcome: "success", durationMs: Date.now() - startedAt, upstreamStatus: upstreamResponse.status });
    return new Response(upstreamResponse.body, { headers: { ...corsHeaders(origin), "content-type": contentType, "cache-control": "private, max-age=60" } });
  } catch (error) {
    const category = isTimeoutError(error) ? "provider_timeout" : "network_failure";
    logAmapEvent({ operation: "static_map", outcome: "failure", durationMs: Date.now() - startedAt, category });
    return json({ error: category === "provider_timeout" ? "地图服务暂时没响应，请稍后再试。" : "网络有点忙，稍后再试。", category }, 502, origin);
  }
});
