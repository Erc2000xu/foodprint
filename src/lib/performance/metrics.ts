export const clientMetricNames = [
  "browser_dns",
  "browser_connect",
  "browser_tls",
  "browser_ttfb",
  "browser_fcp",
  "browser_lcp",
  "browser_inp",
  "browser_cls",
  "pwa_launch_shell_visible",
  "pwa_boot_navigation_start",
  "pwa_app_shell_visible",
  "pwa_home_content_ready",
  "navigation_feedback_visible",
  "navigation_route_committed",
  "navigation_content_ready",
  "navigation_pending_feedback",
  "private_image_visible",
  "private_image_request_start",
  "private_image_load",
  "private_image_decode",
  "private_image_visible_to_decode",
  "private_image_error",
  "private_image_signed_url_refresh",
  "prefetch_started",
  "prefetch_hit",
  "prefetch_cancelled",
  "service_worker_install",
  "service_worker_activate",
  "service_worker_controllerchange",
  "service_worker_update_ready",
  "pwa_reload",
  "amap_load_started",
  "amap_ready",
  "amap_failed",
  "map_pin_mapping_failed",
  "discovery_fallback_to_list",
  "map_pin_selected",
  "map_cluster_opened",
  "viewport_sheet_opened",
  "viewport_sheet_place_opened",
  "map_retry_clicked",
  "map_retry_result",
  "photo_prepare_started",
  "photo_prepare_succeeded",
  "photo_prepare_failed",
  "photo_canonical_upload_failed",
  "photo_thumbnail_deferred",
  "photo_repair_shown",
  "photo_repair_succeeded",
  "photo_repair_failed",
] as const;

export type ClientMetricName = (typeof clientMetricNames)[number];

export const clientMetricDetails = [
  "browser",
  "standalone",
  "cold",
  "warm",
  "first_install",
  "update",
  "user_confirmed",
  "timeout",
  "error",
] as const;

export type ClientMetricDetail = (typeof clientMetricDetails)[number];

export const clientMetricRouteTemplates = [
  "/",
  "/launch",
  "/try",
  "/mark",
  "/activity",
  "/admin",
  "/place/:id",
  "/login",
  "/offline",
  "/api/health",
  "/api/metrics",
  "/api/photos/sign",
  "other",
] as const;

export const clientMetricNetworkTypes = ["wifi", "cellular", "unknown"] as const;
export const clientMetricResourceTypes = ["thumbnail", "display"] as const;
export const clientMetricLifecycleTypes = ["cold", "warm", "first_install", "update"] as const;
export const clientMetricOutcomes = ["success", "timeout", "error"] as const;

export const photoMetricReasons = [
  "source_too_large",
  "source_too_many_pixels",
  "decode_unsupported",
  "decode_failed",
  "webp_encoder_unavailable",
  "output_budget_unmet",
  "request",
  "storage",
  "database",
  "permission",
  "validation",
  "unknown",
] as const;
export const photoMetricSizeBuckets = ["0_1mb", "1_3mb", "3_6mb", "6_20mb", "over_20mb"] as const;
export const photoMetricPixelBuckets = ["0_12mp", "12_24mp", "24_48mp", "over_48mp", "unknown"] as const;
export const photoMetricDurationBuckets = ["lt_500ms", "500ms_2s", "2_10s", "over_10s"] as const;

export type ClientMetricDimensions = {
  routeTemplate?: (typeof clientMetricRouteTemplates)[number];
  browserMode?: "browser" | "standalone";
  lifecycle?: (typeof clientMetricLifecycleTypes)[number];
  resource?: (typeof clientMetricResourceTypes)[number];
  network?: (typeof clientMetricNetworkTypes)[number];
  outcome?: (typeof clientMetricOutcomes)[number];
  reason?: (typeof photoMetricReasons)[number];
  sizeBucket?: (typeof photoMetricSizeBuckets)[number];
  pixelsBucket?: (typeof photoMetricPixelBuckets)[number];
  durationBucket?: (typeof photoMetricDurationBuckets)[number];
};
