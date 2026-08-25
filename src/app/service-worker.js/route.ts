import { buildServiceWorkerScript } from "@/lib/pwa/service-worker-script";
import { deploymentVersion } from "@/lib/release/version";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  // The cookie override exists only for the local cross-version PWA harness;
  // production always uses the immutable deployment environment value.
  const testVersion = process.env.E2E_PWA_UPDATE === "1"
    ? request.headers.get("cookie")?.match(/(?:^|;\s*)foodprint_e2e_version=([^;]+)/)?.[1]
    : undefined;
  const version = testVersion?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || deploymentVersion();
  return new Response(buildServiceWorkerScript(version), { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}
