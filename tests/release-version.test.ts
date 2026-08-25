import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getServiceWorker } from "@/app/service-worker.js/route";
import { buildServiceWorkerScript } from "@/lib/pwa/service-worker-script";

const originalVersion = process.env.DEPLOYMENT_VERSION;

afterEach(() => {
  if (originalVersion === undefined) delete process.env.DEPLOYMENT_VERSION;
  else process.env.DEPLOYMENT_VERSION = originalVersion;
});

describe("release version and PWA update contracts", () => {
  it("returns the running deployment version from health", async () => {
    process.env.DEPLOYMENT_VERSION = "build-b-64847a8b03defaad3f5d5d3f071f82c94dd2c8c1";
    const payload = await getHealth().json();

    expect(payload).toMatchObject({ status: "ok", version: "build-b-64847a8b03defaad3f5d5d3f071f82c94dd2c8c1" });
  });

  it("ignores old service-worker query versions and always emits the current cache", async () => {
    process.env.DEPLOYMENT_VERSION = "build-b-64847a8b03defaad3f5d5d3f071f82c94dd2c8c1";
    const response = getServiceWorker(new Request("http://localhost/service-worker.js?v=build-a-old"));
    const script = await response.text();

    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(script).toContain("foodprint-shell-build-b-64847a8b03defaad3f5d5d3f071f82c94dd2c8c1");
    expect(script).not.toContain("foodprint-shell-build-a-old");
  });

  it("keeps public shell caching separate from private responses", () => {
    const script = buildServiceWorkerScript("build-b");
    expect(script).toContain("Promise.allSettled");
    expect(script).toContain("PRECACHE_TIMEOUT_MS=5000");
    expect(script).toContain("\\/_next\\/static\\/");
    expect(script).not.toContain("/api/");
    expect(script).not.toContain("signedUrl");
  });

  it("carries the release SHA into the runtime image instead of reverting to local", () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
    expect(dockerfile).toContain("ARG DEPLOYMENT_VERSION=local");
    expect(dockerfile).toContain("ENV DEPLOYMENT_VERSION=${DEPLOYMENT_VERSION}");
  });
});
