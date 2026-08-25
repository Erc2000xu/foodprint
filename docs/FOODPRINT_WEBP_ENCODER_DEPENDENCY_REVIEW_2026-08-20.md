# Foodprint WebP encoder dependency review — 2026-08-20

This is the Gate 2 dependency record for the photo-preparation fallback. The
fallback is deliberately static and same-origin: the application does not
load the encoder on the initial shell, and the browser creates the Worker only
after native WebP output has failed validation.

## Pinned inputs

| Package | Version | License | Source | Runtime files copied |
| --- | --- | --- | --- | --- |
| `@jsquash/webp` | `1.5.0` (exact, lockfile) | Apache-2.0; bundled codec notice is BSD/libwebp | [jSquash](https://github.com/jamsinclair/jSquash) | `encode.js`, `meta.js`, `utils.js`, encoder JS/WASM (SIMD and non-SIMD) |
| `wasm-feature-detect` | `1.9.0` (lockfile resolution) | Apache-2.0 | [wasm-feature-detect](https://github.com/GoogleChromeLabs/wasm-feature-detect) | ESM feature-detection module |

The generated bundle is created by
`scripts/prepare-webp-worker.mjs` during both `predev` and `prebuild`. It
rewrites the encoder's package import to a same-origin absolute path and
copies only the encoder dependency graph into `public/workers/webp-codec/`.
Generated files are ignored by Git and are recreated inside the Docker build;
the generator itself is explicitly included in `.dockerignore` exceptions.
The generated runtime payload is 712,330 bytes (about 696 KiB, uncompressed)
across the Worker, ESM glue and SIMD/non-SIMD WASM assets; the browser downloads
it only on the fallback path.

## Review checks

- `@jsquash/webp` is an exact direct dependency and `package-lock.json` is
  committed.
- No third-party origin is introduced: Worker, ESM, and WASM requests are
  same-origin `/workers/webp-codec/*` requests.
- The main bundle has no `new URL(...webp-encoder.worker.ts)` import. The
  Worker is requested only from the fallback path.
- The Worker accepts only transferred RGBA pixel bytes and dimensions; it does
  not receive file names, EXIF, object keys, user IDs, or location data.
- The client bounds work at 15 seconds, rejects invalid MIME/magic/dimensions,
  and terminates the Worker on completion, abort, timeout, unmount, or error.
- The output is wrapped as `image/webp` only after the encoded bytes pass the
  RIFF/WEBP and dimension checks; PNG/JPEG bytes are never relabeled.
- `tests/webp-worker-bundle.test.ts` verifies that the generated Worker is
  plain JavaScript and that the copied dynamic imports resolve to the static
  same-origin layout.

Final production approval still requires the reviewer checks, browser
evidence, and canary/24-hour evidence listed in the handoff document.
