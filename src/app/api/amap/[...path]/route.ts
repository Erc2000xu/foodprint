import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const AMAP_WEB_API = "https://webapi.amap.com";
const AMAP_REST_API = "https://restapi.amap.com";

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!process.env.AMAP_SECURITY_KEY) return NextResponse.json({ message: "地图服务尚未配置。" }, { status: 503 });
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  if (!claims.data?.claims) return NextResponse.json({ message: "请先登录。" }, { status: 401 });

  const { path } = await context.params;
  const upstreamPath = path.join("/");
  if (!upstreamPath || !/^[a-zA-Z0-9/_-]+$/.test(upstreamPath)) return NextResponse.json({ message: "无效的地图请求。" }, { status: 400 });

  const upstream = new URL(upstreamPath.startsWith("v4/map/styles") ? `${AMAP_WEB_API}/${upstreamPath}` : `${AMAP_REST_API}/${upstreamPath}`);
  request.nextUrl.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));
  upstream.searchParams.set("jscode", process.env.AMAP_SECURITY_KEY);

  const response = await fetch(upstream, { headers: { accept: request.headers.get("accept") ?? "*/*" }, cache: "no-store" });
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "private, max-age=300");
  return new NextResponse(response.body, { status: response.status, headers });
}
