# Foodprint V2.4.1 photo-upload repair evidence — 2026-08-20 (updated 2026-08-25)

状态：**仓库实现完成，待真机/生产验收**。本记录不授权合并、发布或写“已修复”。

## Gate 0 snapshot

- Working branch: `codex/fix-v2-4-1-photo-upload`
- Local `main` and the repair branch base are both aligned to public remote
  `main`: `64847a8b03defaad3f5d5d3f071f82c94dd2c8c1` (verified 2026-08-21).
- `main` is an ancestor of the repair worktree; no unrelated local `main`
  commits were overwritten.
- Working tree contains uncommitted repair changes; no PR SHA exists yet.
- `https://foodprint.com.cn/api/health` was rechecked on 2026-08-21 and returned
  `status/service/timestamp` without `version`; therefore production SHA alignment
  is not proven and the release gate remains open.
- Release workflow now asserts `payload.version === github.sha`; this assertion has
  not yet run against a production deployment of this worktree.

## Local automated evidence

| Check | Result | Evidence |
| --- | --- | --- |
| ESLint | PASS | `npm run lint` |
| TypeScript | PASS | `npm run typecheck` |
| Vitest | PASS, 42 files / 134 tests | `npm test` |
| Production build | PASS | `npm run build` with Turbopack process/port permission |
| Runtime release-version contract | PASS (static contract) | Docker runner keeps `DEPLOYMENT_VERSION`; `tests/release-version.test.ts` |
| Generated Worker bundle | PASS | `tests/webp-worker-bundle.test.ts`; static JS + exact WASM assets |
| Local migration replay | PASS on 2026-08-25, 29 migrations; latest `20260818100000` | `supabase db reset --local --no-seed` |
| Local schema contract | PASS | `photos` thumbnail/visit columns, `register_photo_thumbnail` RPC and 4 `photos` policies present |
| Chromium E2E | PASS, 5/5; final dual-project run 10/10 | production-equivalent standalone server; 1/3/9 multipart pairs, forced real Worker/WASM fallback, PWA A→B |
| WebKit E2E | PASS, 5/5; final dual-project run 10/10 | production-equivalent standalone server; 1/3/9 multipart pairs, forced real Worker/WASM fallback, PWA A→B |

The browser E2E fixture is the repository's `public/mascot/empty-map.jpg` with
authorized synthetic padding to 3MB and distinct names. The multipart endpoint is
enabled only with `E2E_PHOTO_UPLOAD=1`; it returns counts/types/dimensions/byte
buckets and stores no image or identifying data.

## What the evidence proves

- Native WebP output is validated by MIME, RIFF/WEBP magic and dimensions.
- The Worker is created only after native output is rejected in production; the
  Worker loads the exact static ESM/WASM bundle and was exercised in Chromium and
  WebKit, including a guarded `force_wasm=1` PhotoPicker path.
- Display and thumbnail files are appended directly to one explicit `FormData`;
  the submit path contains no `DataTransfer` or programmatic `input.files` assignment.
- The real Service Worker registration uses `/service-worker.js` with
  `updateViaCache: "none"`. The WebKit/Chromium PWA test installs build A, switches
  the test-only version cookie to build B, observes the update prompt, reloads, and
  verifies the A shell cache is removed and B remains.
- `photo_prepare_failed` logs preserve sanitized reason, browser mode, format,
  source-size bucket, pixel bucket, duration bucket, encoder path and short version;
  failures are emitted as `error` or `timeout`, while successful photo metrics use
  `success`.

## Still required by the handoff completion definition

- Merge to `main`, obtain the PR SHA, deploy only through `Release production`, and
  prove production health `version` equals that SHA.
- The clean local Supabase migration replay is now complete: 29 migrations
  reached `20260818100000`, and the required photo schema/RPC/policies were
  found. On 2026-08-25, the local CLI was restarted successfully with API,
  Auth, REST, Storage, Realtime, Studio and database containers healthy;
  optional `imgproxy` and `pooler` containers remain stopped. Real
  Storage/DB/signing/repair assertions for 0/1/3/9, 10 rejection, partial
  success, idempotent retry and deletion/replenishment remain pending and
  have not been promoted to PASS from container health alone.
- Execute authorized iPhone Safari, installed iPhone PWA and Android Chrome tests
  at the requested widths, including forced WASM, offline recovery and old-PWA
  update. WebKit is not a substitute for those devices.
- Run production 1/3-photo canary and archive 24-hour sanitized prepare/encoder/
  canonical/repair observations.
- Complete dependency/license/CSP/security review. `npm install` reported six
  high-severity audit findings in the current dependency tree, while the subsequent
  audit endpoint check could not reach the registry from this environment; this is
  not treated as a clean security sign-off.

Until every item above has evidence, the status must remain “修复开发中” or
“仓库实现完成，待真机/生产验收”。
