// @vitest-environment node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workerScript = path.join(root, "scripts/prepare-webp-worker.mjs");
const workerPath = path.join(root, "public/workers/webp-encoder.worker.js");
const codecRoot = path.join(root, "public/workers/webp-codec");

describe("lazy WebP worker bundle", () => {
  it("is reproducible, plain JavaScript, and has no bare package runtime import", () => {
    execFileSync(process.execPath, [workerScript], { cwd: root, stdio: "ignore" });

    const worker = fs.readFileSync(workerPath, "utf8");
    const encoder = fs.readFileSync(path.join(codecRoot, "encode.js"), "utf8");
    expect(worker).toContain('import encodeWebp from "/workers/webp-codec/encode.js"');
    expect(worker).not.toMatch(/:\s*(ArrayBuffer|number|Error|Uint8)/);
    expect(worker).not.toContain("@jsquash/webp");
    expect(encoder).toContain('from "/workers/webp-codec/wasm-feature-detect.js";');
    expect(encoder).not.toContain("from 'wasm-feature-detect'");
    expect(fs.statSync(path.join(codecRoot, "codec/enc/webp_enc.wasm")).size).toBeGreaterThan(100_000);
    expect(fs.statSync(path.join(codecRoot, "codec/enc/webp_enc_simd.wasm")).size).toBeGreaterThan(100_000);
  });
});
