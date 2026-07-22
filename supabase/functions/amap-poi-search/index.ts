import { createClient } from "npm:@supabase/supabase-js@2";

const appOrigins = new Set(["https://foodprint-nine.vercel.app", "http://localhost:3000"]);

function corsHeaders(origin: string | null) {
  return {
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-origin": origin && appOrigins.has(origin) ? origin : "https://foodprint-nine.vercel.app",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin",
  };
}

function response(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return response({ error: "仅支持 POST 请求。" }, 405, origin);
  if (origin && !appOrigins.has(origin)) return response({ error: "无效的应用来源。" }, 403, origin);

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

    const body = await request.json() as { keyword?: unknown };
    const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
    if (keyword.length < 2 || keyword.length > 80) return response({ error: "请输入 2 至 80 个字符的地点名称。" }, 400, origin);
    const amapKey = Deno.env.get("AMAP_WEBSERVICE_KEY");
    if (!amapKey) return response({ error: "地点搜索服务尚未配置。" }, 503, origin);

    const upstream = new URL("https://restapi.amap.com/v3/assistant/inputtips");
    upstream.searchParams.set("key", amapKey);
    upstream.searchParams.set("keywords", keyword);
    upstream.searchParams.set("city", "全国");
    upstream.searchParams.set("datatype", "all");
    const upstreamResponse = await fetch(upstream, { signal: AbortSignal.timeout(8_000) });
    const payload = await upstreamResponse.json() as { status?: string; info?: string; infocode?: string; tips?: Array<{ id?: string; name?: string; address?: string; district?: string; location?: string }> };
    if (!upstreamResponse.ok || payload.status !== "1") return response({ error: payload.info ?? "高德地点搜索失败。", errorCode: payload.infocode }, 502, origin);

    const candidates = (payload.tips ?? []).flatMap((tip) => {
      const [longitude, latitude] = (tip.location ?? "").split(",").map(Number);
      return tip.id && tip.name && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{ poiId: tip.id, name: tip.name, address: tip.address ?? "", city: "", district: tip.district ?? "", latitude, longitude }]
        : [];
    }).slice(0, 10);
    return response({ candidates }, 200, origin);
  } catch (error) {
    console.error("AMap POI search failed", { message: error instanceof Error ? error.message : "unknown error" });
    return response({ error: "高德地点搜索服务暂时无法连接。" }, 502, origin);
  }
});
