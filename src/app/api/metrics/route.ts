import { z } from "zod";
import { clientMetricDetails, clientMetricNames, clientMetricLifecycleTypes, clientMetricNetworkTypes, clientMetricOutcomes, clientMetricResourceTypes, clientMetricRouteTemplates, photoMetricDurationBuckets, photoMetricPixelBuckets, photoMetricReasons, photoMetricSizeBuckets } from "@/lib/performance/metrics";
import { normalizePerformanceRoute, recordServerMetric } from "@/lib/performance/server";

export const dynamic = "force-dynamic";

const metricItem = z.object({
  metric: z.enum(clientMetricNames),
  value: z.number().finite().min(0).max(600_000),
  route: z.string().max(160).optional(),
  detail: z.enum(clientMetricDetails).optional(),
  dimensions: z.object({
    routeTemplate: z.enum(clientMetricRouteTemplates).optional(),
    browserMode: z.enum(["browser", "standalone"]).optional(),
    lifecycle: z.enum(clientMetricLifecycleTypes).optional(),
    resource: z.enum(clientMetricResourceTypes).optional(),
    network: z.enum(clientMetricNetworkTypes).optional(),
    outcome: z.enum(clientMetricOutcomes).optional(),
    reason: z.enum(photoMetricReasons).optional(),
    sizeBucket: z.enum(photoMetricSizeBuckets).optional(),
    pixelsBucket: z.enum(photoMetricPixelBuckets).optional(),
    durationBucket: z.enum(photoMetricDurationBuckets).optional(),
  }).strict().optional(),
});
const metricPayload = z.union([metricItem, z.object({ metrics: z.array(metricItem).min(1).max(20) })]);

export async function POST(request: Request) {
  try {
    const parsed = metricPayload.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "invalid_metric" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const metrics = "metrics" in parsed.data ? parsed.data.metrics : [parsed.data];
    metrics.forEach((item) => recordServerMetric(`client.${item.metric}`, {
      route: normalizePerformanceRoute(item.route ?? item.dimensions?.routeTemplate ?? "/"),
      value: item.value,
      outcome: item.dimensions?.outcome === "timeout" || item.detail === "timeout" ? "timeout" : item.dimensions?.outcome === "error" || item.detail === "error" ? "error" : "ok",
    }));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "invalid_metric" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
