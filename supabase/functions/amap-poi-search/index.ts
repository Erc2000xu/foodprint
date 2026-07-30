import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyProviderFailure, corsHeaders as buildCorsHeaders, isAllowedOrigin, isTimeoutError, logAmapEvent, parseAllowedOrigins, type AmapFailureCategory } from "../_shared/amap-reliability.ts";

const allowedOrigins = parseAllowedOrigins(Deno.env.get("APP_ALLOWED_ORIGINS"));

function corsHeaders(origin: string | null) {
  return buildCorsHeaders(origin, allowedOrigins, { methods: "POST, OPTIONS", contentType: "application/json; charset=utf-8" });
}

function response(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function providerMessage(category: AmapFailureCategory) {
  return category === "provider_auth_failure" ? "地图服务配置需要处理，请稍后再试。" : "地点服务暂时没响应，请稍后再试。";
}

function coordinatesFrom(location: unknown) {
  const values = Array.isArray(location) ? location : typeof location === "string" ? location.split(",") : [];
  const [longitude, latitude] = values.map(Number);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function cityFrom(value: unknown) {
  if (typeof value !== "string") return "";
  const match = value.match(/(北京市|天津市|上海市|重庆市|[^省自治区特别行政区]+市)/);
  return match?.[1] ?? "";
}

type BusinessAreaCandidate = {
  place_id: string;
  group_place_id: string;
  latitude: number;
  longitude: number;
  failure_count: number;
};

function isoAfter(milliseconds: number) {
  return new Date(Date.now() + milliseconds).toISOString();
}

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    logAmapEvent({ operation: "poi_search", outcome: "failure", durationMs: Date.now() - startedAt, category: "origin_rejected" });
    return response({ error: "地图服务正在更新，请稍后再试。", category: "origin_rejected" }, 403, origin);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return response({ error: "仅支持 POST 请求。" }, 405, origin);

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization) return response({ error: "请先登录后再搜索地点。" }, 401, origin);
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!publishableKey || !supabaseUrl) return response({ error: "地点搜索服务配置不完整。" }, 503, origin);
    const supabase = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return response({ error: "请先登录后再搜索地点。" }, 401, origin);
    const { data: memberships, error: membershipError } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
    if (membershipError) throw membershipError;
    if (!memberships?.length) return response({ error: "你尚未加入可用的共同地图。" }, 403, origin);

    const body = await request.json() as { operation?: unknown; keyword?: unknown; location?: { latitude?: unknown; longitude?: unknown }; groupPlaceId?: unknown };
    const operation = body.operation === "districts" ? "districts" : body.operation === "business_area_backfill" ? "business_area_backfill" : "poi_search";
    const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
    if (operation === "poi_search" && (keyword.length < 2 || keyword.length > 80)) return response({ error: "请输入 2 至 80 个字符的地点名称。" }, 400, origin);
    const amapKey = Deno.env.get("AMAP_WEBSERVICE_KEY");
    if (!amapKey) {
      logAmapEvent({ operation: "poi_search", outcome: "failure", durationMs: Date.now() - startedAt, category: "provider_auth_failure" });
      return response({ error: "地图服务配置需要处理，请稍后再试。", category: "provider_auth_failure" }, 503, origin);
    }

    if (operation === "districts") {
      const upstream = new URL("https://restapi.amap.com/v3/config/district");
      upstream.searchParams.set("key", amapKey);
      upstream.searchParams.set("keywords", "北京");
      upstream.searchParams.set("subdistrict", "1");
      upstream.searchParams.set("extensions", "base");
      const upstreamResponse = await fetch(upstream, { signal: AbortSignal.timeout(8_000) });
      const payload = await upstreamResponse.json() as { status?: string; infocode?: string; districts?: Array<{ districts?: Array<{ name?: string; adcode?: string }> }> };
      if (!upstreamResponse.ok || payload.status !== "1") {
        const category = classifyProviderFailure(upstreamResponse.status, payload.infocode);
        logAmapEvent({ operation: "poi_search", outcome: "failure", durationMs: Date.now() - startedAt, category, upstreamStatus: upstreamResponse.status, infocode: payload.infocode });
        return response({ error: providerMessage(category), category }, 502, origin);
      }
      const districts = (payload.districts?.[0]?.districts ?? []).flatMap((district) => district.name && district.adcode ? [{ name: district.name, adcode: district.adcode }] : []);
      logAmapEvent({ operation: "poi_search", outcome: "success", durationMs: Date.now() - startedAt, upstreamStatus: upstreamResponse.status });
      return response({ districts }, 200, origin);
    }

    if (operation === "business_area_backfill") {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (body.groupPlaceId !== undefined && (typeof body.groupPlaceId !== "string" || !uuidPattern.test(body.groupPlaceId))) {
        return response({ error: "地点信息无效。" }, 400, origin);
      }
      const groupPlaceId = typeof body.groupPlaceId === "string" ? body.groupPlaceId : null;
      const { data: candidates, error: candidateError } = await supabase.rpc("list_amap_business_area_backfill_candidates", {
        p_group_place_id: groupPlaceId,
        p_limit: groupPlaceId ? 1 : 3,
      });
      if (candidateError) throw candidateError;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceRoleKey) return response({ error: "商圈缓存服务配置不完整。" }, 503, origin);
      const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const saveBusinessAreaCache = async (values: Record<string, unknown>) => {
        const { error } = await service.from("place_amap_business_area_cache").upsert(values, { onConflict: "place_id" });
        if (error) throw error;
      };
      let updated = 0;

      for (const candidate of (candidates ?? []) as BusinessAreaCandidate[]) {
        try {
          await saveBusinessAreaCache({
            place_id: candidate.place_id,
            status: "pending",
            business_area_name: null,
            adcode: null,
            center_latitude: null,
            center_longitude: null,
            last_attempt_at: new Date().toISOString(),
            failure_category: null,
          });
          const upstream = new URL("https://restapi.amap.com/v3/geocode/regeo");
          upstream.searchParams.set("key", amapKey);
          upstream.searchParams.set("location", `${candidate.longitude},${candidate.latitude}`);
          upstream.searchParams.set("extensions", "all");
          upstream.searchParams.set("radius", "1000");
          upstream.searchParams.set("roadlevel", "0");
          const upstreamResponse = await fetch(upstream, { signal: AbortSignal.timeout(8_000) });
          const payload = await upstreamResponse.json() as {
            status?: string;
            infocode?: string;
            regeocode?: { addressComponent?: { adcode?: string; businessAreas?: Array<{ name?: string; location?: unknown }> } };
          };
          if (!upstreamResponse.ok || payload.status !== "1") {
            const category = classifyProviderFailure(upstreamResponse.status, payload.infocode);
            const failureCount = Math.min(Number(candidate.failure_count ?? 0) + 1, 100);
            await saveBusinessAreaCache({
              place_id: candidate.place_id,
              status: "temporary_failure",
              business_area_name: null,
              adcode: null,
              center_latitude: null,
              center_longitude: null,
              failure_count: failureCount,
              failure_category: category,
              next_refresh_after: isoAfter(Math.min(24, 2 ** Math.min(failureCount, 5)) * 60 * 60 * 1000),
              last_attempt_at: new Date().toISOString(),
            });
            continue;
          }
          const component = payload.regeocode?.addressComponent;
          const businessAreas = Array.isArray(component?.businessAreas) ? component.businessAreas : [];
          const businessArea = businessAreas.find((item) => item.name);
          const hasBusinessArea = Boolean(businessArea?.name && component?.adcode);
          const center = coordinatesFrom(businessArea?.location);
          await saveBusinessAreaCache({
            place_id: candidate.place_id,
            status: hasBusinessArea ? "success" : "not_found",
            business_area_name: hasBusinessArea ? businessArea?.name ?? null : null,
            adcode: hasBusinessArea ? component?.adcode ?? null : null,
            center_latitude: center?.latitude ?? null,
            center_longitude: center?.longitude ?? null,
            queried_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString(),
            next_refresh_after: isoAfter(30 * 24 * 60 * 60 * 1000),
            failure_count: 0,
            failure_category: null,
          });
          updated += 1;
        } catch (error) {
          const category = isTimeoutError(error) ? "provider_timeout" : "network_failure";
          const failureCount = Math.min(Number(candidate.failure_count ?? 0) + 1, 100);
          await saveBusinessAreaCache({
            place_id: candidate.place_id,
            status: "temporary_failure",
            business_area_name: null,
            adcode: null,
            center_latitude: null,
            center_longitude: null,
            failure_count: failureCount,
            failure_category: category,
            next_refresh_after: isoAfter(Math.min(24, 2 ** Math.min(failureCount, 5)) * 60 * 60 * 1000),
            last_attempt_at: new Date().toISOString(),
          });
        }
      }
      logAmapEvent({ operation: "business_area_backfill", outcome: "success", durationMs: Date.now() - startedAt });
      return response({ processed: (candidates ?? []).length, updated }, 200, origin);
    }

    const latitude = Number(body.location?.latitude);
    const longitude = Number(body.location?.longitude);
    const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    const upstream = new URL(hasLocation ? "https://restapi.amap.com/v3/place/around" : "https://restapi.amap.com/v3/assistant/inputtips");
    upstream.searchParams.set("key", amapKey);
    upstream.searchParams.set("keywords", keyword);
    if (hasLocation) {
      upstream.searchParams.set("location", `${longitude},${latitude}`);
      upstream.searchParams.set("radius", "50000");
      upstream.searchParams.set("offset", "25");
      upstream.searchParams.set("page", "1");
      upstream.searchParams.set("extensions", "base");
      upstream.searchParams.set("sortrule", "distance");
    } else {
      upstream.searchParams.set("city", "全国");
      upstream.searchParams.set("datatype", "all");
    }
    const upstreamResponse = await fetch(upstream, { signal: AbortSignal.timeout(8_000) });
    const payload = await upstreamResponse.json() as { status?: string; info?: string; infocode?: string; tips?: Array<{ id?: string; name?: string; address?: string; city?: string; district?: string; location?: unknown }>; pois?: Array<{ id?: string; name?: string; address?: string; cityname?: string; adname?: string; location?: unknown }> };
    if (!upstreamResponse.ok || payload.status !== "1") {
      const category = classifyProviderFailure(upstreamResponse.status, payload.infocode);
      logAmapEvent({ operation: "poi_search", outcome: "failure", durationMs: Date.now() - startedAt, category, upstreamStatus: upstreamResponse.status, infocode: payload.infocode });
      return response({ error: providerMessage(category), category }, 502, origin);
    }

    const source = hasLocation
      ? (payload.pois ?? []).map((poi) => ({ id: poi.id, name: poi.name, address: poi.address, city: poi.cityname, district: poi.adname, location: poi.location }))
      : (payload.tips ?? []);
    const candidates = source.flatMap((tip) => {
      const coordinates = coordinatesFrom(tip.location);
      return tip.id && tip.name && coordinates
        ? [{ poiId: tip.id, name: tip.name, address: tip.address ?? "", city: tip.city ?? cityFrom(tip.district), district: tip.district ?? "", ...coordinates }]
        : [];
    }).slice(0, hasLocation ? 25 : 10);
    logAmapEvent({ operation: "poi_search", outcome: "success", durationMs: Date.now() - startedAt, upstreamStatus: upstreamResponse.status });
    return response({ candidates }, 200, origin);
  } catch (error) {
    const category = isTimeoutError(error) ? "provider_timeout" : "network_failure";
    logAmapEvent({ operation: "poi_search", outcome: "failure", durationMs: Date.now() - startedAt, category });
    return response({ error: category === "provider_timeout" ? "地点服务暂时没响应，请稍后再试。" : "网络有点忙，稍后再试。", category }, 502, origin);
  }
});
