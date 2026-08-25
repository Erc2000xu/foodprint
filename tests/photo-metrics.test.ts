import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/metrics/route";

describe("photo metric privacy and failure semantics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps reason, encoder path, browser mode and buckets in structured logs", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(new Request("http://localhost/api/metrics", {
      method: "POST",
      body: JSON.stringify({
        metrics: [{
          metric: "photo_prepare_failed",
          value: 1,
          route: "/mark",
          detail: "error",
          dimensions: {
            reason: "webp_encoder_unavailable",
            browserMode: "standalone",
            format: "jpeg",
            sizeBucket: "3_6mb",
            pixelsBucket: "24_48mp",
            durationBucket: "2_10s",
            encoderPath: "wasm",
            deploymentVersion: "64847a8b03de",
          },
        }],
      }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(204);
    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      metric: "client.photo_prepare_failed",
      outcome: "error",
      reason: "webp_encoder_unavailable",
      browserMode: "standalone",
      format: "jpeg",
      sizeBucket: "3_6mb",
      pixelsBucket: "24_48mp",
      durationBucket: "2_10s",
      encoderPath: "wasm",
      deploymentVersion: "64847a8b03de",
    });
  });

  it("records successful photo preparation with the success outcome", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(new Request("http://localhost/api/metrics", {
      method: "POST",
      body: JSON.stringify({
        metric: "photo_prepare_succeeded",
        value: 1,
        route: "/mark",
        dimensions: { outcome: "success", browserMode: "browser", encoderPath: "native", format: "jpeg" },
      }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(204);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ metric: "client.photo_prepare_succeeded", outcome: "success", encoderPath: "native" });
  });
});
