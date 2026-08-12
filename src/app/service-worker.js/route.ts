import { buildServiceWorkerScript } from "@/lib/pwa/service-worker-script";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const build = new URL(request.url).searchParams.get("v")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "current";
  return new Response(buildServiceWorkerScript(build), { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}
