import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// AMap is a mainland-China provider. Keep this small proxy close to it instead
// of Vercel's default US function region, where outbound connectivity is less reliable.
export const runtime = "edge";
export const preferredRegion = "hnd1";

type AmapTip = { id?: string; name?: string; address?: string; district?: string; location?: string };

function coordinatesFrom(location?: string) {
  const [longitude, latitude] = (location ?? "").split(",").map(Number);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export async function GET(request: NextRequest) {
  try {
    const keyword = request.nextUrl.searchParams.get("keyword")?.trim() ?? "";
    if (keyword.length < 2 || keyword.length > 80) return NextResponse.json({ error: "请输入 2 至 80 个字符的地点名称。" }, { status: 400 });
    if (!process.env.AMAP_WEBSERVICE_KEY) return NextResponse.json({ error: "地点搜索服务尚未配置。" }, { status: 503 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录后再搜索地点。" }, { status: 401 });
    const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id).eq("status", "active").limit(1);
    if (!memberships?.length) return NextResponse.json({ error: "你尚未加入可用的共同地图。" }, { status: 403 });

    const upstream = new URL("https://restapi.amap.com/v3/assistant/inputtips");
    upstream.searchParams.set("key", process.env.AMAP_WEBSERVICE_KEY);
    upstream.searchParams.set("keywords", keyword);
    upstream.searchParams.set("city", "全国");
    upstream.searchParams.set("datatype", "all");

    const response = await fetch(upstream, { cache: "no-store" });
    const payload = await response.json() as { status?: string; info?: string; infocode?: string; tips?: AmapTip[] };
    if (!response.ok || payload.status !== "1") {
      return NextResponse.json({ error: payload.info ?? "高德地点搜索失败。", errorCode: payload.infocode }, { status: 502 });
    }
    const candidates = (payload.tips ?? []).flatMap((tip) => {
      const coordinates = coordinatesFrom(tip.location);
      return tip.id && tip.name && coordinates ? [{ poiId: tip.id, name: tip.name, address: tip.address ?? "", city: "", district: tip.district ?? "", ...coordinates }] : [];
    }).slice(0, 10);
    return NextResponse.json({ candidates }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("AMap POI search failed", { message });
    return NextResponse.json({ error: "高德地点搜索服务暂时无法连接。" }, { status: 502 });
  }
}
