# New Chat Starter (Ready-to-Use)

_Last updated: 2026-04-28 (Asia/Rangoon)_

Use this file to continue work in a brand-new chat without losing context.

## New Chat Title

- `Social-Org-Manager ငွေစာရင်းမှတ်တမ်းများပြင်ဆင်ခြင်း`

## Branch + Safety

- Branch: `deploy-fix`
- Hard constraints:
  - no destructive resets
  - protect existing org data
  - keep strict ORG isolation (`ORG001` / `ORG002`)
  - verify deployed commit from `/api/sync/health` after deploy
  - avoid committing large release artifacts unless intentionally publishing a release

## Current Baseline

- Latest local `deploy-fix` commit before this doc refresh: `403c2bc`
- Latest Render health commit verified on production: `403c2bce1b88fff82a585ae39ce42a43b29f8504`
- Central Admin update channel status:
  - mobile version `1.1.74` (build `75`)
  - desktop version `1.1.74` (build `74`)
- GitHub latest release tag is still:
  - `v1.1.73` (not yet bumped to `v1.1.74`)

## What Is Already Live / Completed In Code

- Restore/import safety fixes are in place (selected file direct restore, no large JSON loss, local-first restore push).
- Variant split is active:
  - `org-client`
  - `central-admin`
- Desktop split behavior:
  - `Social Org Manager` opens org-client flow
  - `Org Registry Central Admin` opens admin flow
- Central admin login cleanup:
  - removed old `Org User Login သို့ ပြန်သွားမည်` button from admin login flow
  - username field defaults to blank (not forced `admin`)
  - login supports username/email input
  - password `Show / Hide` on admin sign-in
- Dedicated **Admin User Management** page is added (menu route + separate page):
  - create/edit multiple admin users
  - profile-style cards per admin
  - phone, email, address, appointed date, status note
  - status control (`active`, `suspended`, `terminated`)
  - per-admin password reset with `Show / Hide`

## Recent Key Commits

- `4c485ca` Central admin login cleanup, multi-admin support, and v1.1.74 desktop channel bump
- `7aae921` Publish Central Admin APK v1.1.74 update channel
- `48b2a70` Ignore local Gradle cache and build artifacts
- `772c4bd` Add dedicated admin user management page and profile controls
- `403c2bc` Refresh Central Admin APK/desktop update channels after new builds

## Current Release Assets (Local `releases/`)

- Org Client APK:
  - `social-org-manager-org-client-v1.1.73-202604250402.apk`
- Central Admin APK (latest local):
  - `org-registry-central-admin-v1.1.74-202604270302.apk`
- Org Client EXE:
  - `Social-Org-Manager-Setup-v1.1.73.exe`
- Central Admin EXE (latest local):
  - `Org-Registry-Central-Admin-Setup-v1.1.74.exe`

## Restore / Rollback Landmarks

- `restore-point-2026-04-24-pre-variant-split` -> `28d9e0b`
- `restore-point-2026-04-24-variant-scaffold-foundation` -> `c5a6d2d`
- `restore-point-2026-04-24-variant-route-guard-groundwork` -> `e2fd603`
- `restore-point-2026-04-24-variant-update-channel-groundwork` -> `48ae9a3`
- `restore-point-2026-04-24-variant-desktop-admin-groundwork` -> `583ce64`

## Must-Read Order

1. `PROJECT_SELF_AUDIT.md`
2. `docs/part7-session-summary.md`
3. `docs/restore-points.md`
4. `MAINTENANCE.md`
5. `docs/variant-split-checklist.md`
6. `docs/first-run-reconnect-spec.md`
7. `docs/org-reconnect-smoke-test-matrix.md`

## Copy/Paste Prompt For New Chat

```text
Chat title:
Social-Org-Manager ငွေစာရင်းမှတ်တမ်းများပြင်ဆင်ခြင်း

Please read and follow, in order:
1) PROJECT_SELF_AUDIT.md
2) docs/part7-session-summary.md
3) docs/restore-points.md
4) MAINTENANCE.md
5) docs/variant-split-checklist.md
6) docs/first-run-reconnect-spec.md
7) docs/org-reconnect-smoke-test-matrix.md

Work on branch: deploy-fix
Hard constraints:
- no destructive resets
- protect existing org data
- keep strict ORG isolation (ORG001/ORG002)
- verify Render deployed commit from /api/sync/health after any deploy
- keep org-client and central-admin behaviors separated

Current baseline:
- local HEAD: 403c2bc
- live commit: 403c2bce1b88fff82a585ae39ce42a43b29f8504
- central-admin update channel: 1.1.74
- GitHub latest release tag: v1.1.73

Continue from:
1) accounting record improvements requested in the new chat
2) release maintenance and sync verification
3) without undoing split-variant/admin-management fixes
```

## Immediate Next Tasks (If Continuing Now)

1. Publish GitHub release/tag assets for `v1.1.74` if auto-update must resolve from `releases/latest`.
2. Run final QA for Central Admin APK/EXE `1.1.74` on clean devices.
3. Decide whether web should stay unified or get dedicated `org-client` / `central-admin` URLs.

## Current Working Directives (2026-04-28)

1. Finance receipt numbers must remain unique across all transaction records (`income`/`expense`/`transfer`/loan-related entries).
2. Member-related finance visibility must include valid member-linked records even when legacy rows rely on payer/payee text instead of explicit `memberId`.
3. Temporary test-phase mode: treasurer can perform direct finance delete/change locally; staged audit-chair delete workflow will be re-enabled after data cleanup/finalization.
