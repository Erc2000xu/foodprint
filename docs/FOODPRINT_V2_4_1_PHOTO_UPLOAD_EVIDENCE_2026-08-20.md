# Foodprint V2.4.1 photo-upload repair evidence — 2026-08-20 (updated 2026-08-26)

状态：**仓库实现完成，待真机/生产验收**。候选生产发布已部署并通过单次公网版本校验；文档 DoD 尚未完成。本记录不宣称“修复完成”或正式发布完成。

## Gate 0 snapshot

- Authoritative production branch: `main`; the local worktree is being used to
  prepare this evidence update and is not itself a release source.
- The photo-upload repair was merged through PR #39; the resulting `main` SHA was
  `5d30650cb58e1e8a583b318b7230c4fb87cdd7c5` (verified 2026-08-25).
- The transport follow-up PRs #40 and #41 were merged as
  `b71817e4b7f32f4a74497763dba522cb9ea5ed6b` and
  `3076d75ad279f8acad2ef6b6af163fb6bc6f6206`; PR #42 corrected the first-upload
  versus resume contract and was merged as
  `b7a01537253f576857187ac7a68b884641c0fdd8`.
- The candidate release below deployed that exact `main` SHA. The public health
  response now contains `version`, and the workflow assertion
  `payload.version === github.sha` passed; this proves the release-chain SHA
  alignment for this candidate, not the full photo-upload DoD.

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

## Candidate production release retry — 2026-08-25

- PR #40 CI passed: application validation and migration integrity both PASS;
  it was merged as `b71817e4b7f32f4a74497763dba522cb9ea5ed6b`.
- Candidate release workflow: [Release production run 32861913806](https://github.com/Erc2000xu/foodprint/actions/runs/32861913806).
- Release request, clean migration replay, release-candidate Chromium/WebKit
  gates, production migration plan/application, POI Edge Function deploy,
  Docker image build and bundle packaging all PASS.
- The upload step failed at `2026-08-25T14:54:28Z` with
  `stat remote: No such file or directory` on all three attempts. Tencent Cloud
  installation and public health SHA verification did not run.
- Root cause identified from the log and OpenSSH `sftp` contract: `put` requires
  its remote path to be a directory, and `put -a` only resumes an existing
  remote file. The first correction supplied `put -a` for a missing remote file,
  so the client reported `stat remote` without creating it. The next correction
  checks remote existence, uses plain `put` for first creation and `put -a` only
  for retries, then verifies size and atomically renames the stable partial.
  CI and a new candidate release are required before treating transport as PASS.

## Candidate production release retry 2 — 2026-08-25

- Candidate release workflow: [Release production run 32863602109](https://github.com/Erc2000xu/foodprint/actions/runs/32863602109), using main SHA `3076d75ad279f8acad2ef6b6af163fb6bc6f6206`.
- All pre-upload gates passed again, but all three SFTP attempts reported
  `stat remote: No such file or directory` because `put -a` was used before a
  remote partial existed. Tencent Cloud installation and public health SHA
  verification did not run.
- The correction is recorded in PR #42 and must pass CI and a new candidate
  release before transport can be marked PASS.

## Candidate production release — 2026-08-25 (transport/install/health PASS)

- Candidate release workflow: [Release production run 32865215988](https://github.com/Erc2000xu/foodprint/actions/runs/32865215988), using main SHA
  `b7a01537253f576857187ac7a68b884641c0fdd8`.
- Intentional release request, clean migration replay, release-candidate
  Chromium/WebKit gates, production migration plan/application, POI Edge Function
  deploy, immutable Docker image build and bundle packaging all PASS.
- The corrected first-upload path used plain SFTP `put` to the remote directory;
  the log recorded `release bundle upload verified: 94304963 bytes` at
  `2026-08-25T17:22:25Z`. The bundle was then atomically installed by the
  Tencent Cloud release installer, which reported
  `foodprint release b7a01537253f576857187ac7a68b884641c0fdd8 is active`.
- The workflow's public endpoint assertion passed after a transient connection
  reset during service restart. An independent check at
  `2026-08-25T17:23:18.953Z` returned:

  ```json
  {"status":"ok","service":"foodprint","version":"b7a01537253f576857187ac7a68b884641c0fdd8","timestamp":"2026-08-25T17:23:18.953Z"}
  ```

- A production request to `/service-worker.js?v=old` returned
  `foodprint-shell-b7a01537253f576857187ac7a68b884641c0fdd8`, confirming the
  legacy-query compatibility route emits the current deployment version. This
  is server-side evidence only; the installed iPhone PWA still needs a real
  device upgrade test.

- This is a PASS for candidate transport, installation and one public health
  assertion. It is not a PASS for real-device acceptance, production canary
  behavior, 24-hour observations or the complete handoff DoD.

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
