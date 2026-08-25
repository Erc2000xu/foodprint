import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = join(projectRoot, "node_modules");
const outputRoot = join(projectRoot, "public", "workers");
const codecRoot = join(outputRoot, "webp-codec");

const copiedFiles = [
  ["@jsquash/webp/meta.js", "meta.js"],
  ["@jsquash/webp/utils.js", "utils.js"],
  ["@jsquash/webp/codec/enc/webp_enc.js", "codec/enc/webp_enc.js"],
  ["@jsquash/webp/codec/enc/webp_enc.wasm", "codec/enc/webp_enc.wasm"],
  ["@jsquash/webp/codec/enc/webp_enc_simd.js", "codec/enc/webp_enc_simd.js"],
  ["@jsquash/webp/codec/enc/webp_enc_simd.wasm", "codec/enc/webp_enc_simd.wasm"],
  ["wasm-feature-detect/dist/esm/index.js", "wasm-feature-detect.js"],
];

mkdirSync(codecRoot, { recursive: true });

const wasmFeatureDetectImport = 'from "/workers/webp-codec/wasm-feature-detect.js";';
const encodeSource = readFileSync(join(packageRoot, "@jsquash/webp", "encode.js"), "utf8");
const patchedEncodeSource = encodeSource.replace(
  "from 'wasm-feature-detect';",
  wasmFeatureDetectImport,
);

if (patchedEncodeSource === encodeSource) {
  throw new Error("The pinned @jsquash/webp encode.js import shape changed; review the worker bundle before building.");
}

writeFileSync(join(codecRoot, "encode.js"), patchedEncodeSource);

for (const [source, target] of copiedFiles) {
  const targetPath = join(codecRoot, target);
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(join(packageRoot, source), targetPath);
}

writeFileSync(
  join(outputRoot, "webp-encoder.worker.js"),
  `import encodeWebp from "/workers/webp-codec/encode.js";

self.addEventListener("message", async (event) => {
  const request = event.data;
  if (!request || request.type !== "encode") return;

  try {
    const pixels = new Uint8ClampedArray(request.data);
    const encoded = await encodeWebp(
      { data: pixels, width: request.width, height: request.height },
      { quality: request.quality },
    );
    const data = encoded instanceof ArrayBuffer
      ? encoded
      : encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
    self.postMessage({ id: request.id, ok: true, data }, [data]);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "webp_encode_failed",
    });
  }
});
`,
);

console.log(`Prepared lazy WebP worker and WASM assets in ${outputRoot}`);
