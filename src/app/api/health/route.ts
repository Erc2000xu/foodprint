import { deploymentVersion } from "@/lib/release/version";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", service: "foodprint", version: deploymentVersion(), timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
