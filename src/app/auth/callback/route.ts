import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const url = new URL(request.url); const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next?.startsWith("/") ? next : "/";
  const response = NextResponse.redirect(new URL(safeNext, url.origin));
  if (!code) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  await supabase.auth.exchangeCodeForSession(code);
  return response;
}
