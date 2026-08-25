# Foodprint V2.4.1 photo-upload repair evidence — 2026-08-20 (updated 2026-08-25)

状态：**候选发布被传输超时阻塞，待重新发布后真机/生产验收**。本记录不宣称“已修复”或完成 DoD。

## Gate 0 snapshot

- Working branch: `codex/fix-release-transfer` (release transport follow-up).
- The photo-upload repair was merged through PR #39; the resulting `main` SHA is
  `5d30650cb58e1e8a583b318b7230c4fb87cdd7c5` (verified 2026-08-25).
- No unrelated local `main` commits were overwritten; the follow-up transport
  change is not merged or released yet.
- `https://foodprint.com.cn/api/health` was rechecked before the candidate release
  and returned `status/service/timestamp` without `version`; production SHA
  alignment is still not proven.
- Release workflow now asserts `payload.version === github.sha`; this assertion has
  not run because the candidate release stopped before installation.

## Candidate production release attempt — 2026-08-25

- PR #39 CI passed: application validation and migration integrity both PASS.
- Candidate release workflow: [Release production run 32845749455](https://github.com/Erc2000xu/foodprint/actions/runs/32845749455).
- Request, clean migration replay, Chromium/WebKit release-candidate E2E,
  production migration plan/application, Edge Function deploy, Docker image build
  and bundle packaging all PASS.
- The upload step started at `2026-08-25T12:10:38Z` using `scp` and was canceled by
  the 180-minute job boundary at `2026-08-25T14:09:24Z` before installation.
  Tencent Cloud installation and public health SHA verification therefore did not
  run. This is a release-chain BLOCKED result, not production acceptance.
- Follow-up branch changes the transfer to resumable SFTP with remote byte-size
  verification, atomic rename, bounded retries and a 180-minute deployment
  window. It must pass CI and a new candidate release before any true-device test.

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

- Pass the release-transport follow-up CI, deploy only through `Release production`,
  and prove production health `version` equals the deployed `main` SHA.
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
“候选发布被传输超时阻塞，待重新发布后真机/生产验收”。
