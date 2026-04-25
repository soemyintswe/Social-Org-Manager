# New Chat Starter (Ready-to-Use)

_Last updated: 2026-04-26 (Asia/Rangoon)_

Use this file to continue work in a brand-new chat without losing context.

## Branch + Safety

- Branch: `deploy-fix`
- Hard constraints:
  - no destructive resets
  - protect existing org data
  - keep strict ORG isolation (`ORG001` / `ORG002`)
  - verify deployed commit from `/api/sync/health` after deploy
  - avoid committing large release artifacts unless intentionally publishing a release

## Current Baseline

- Latest local `deploy-fix` commit before this doc refresh: `18b45ba`
- Latest Render health commit verified on production line: `18b45bae78485455e2c978f63010af637d400516`
- Current public release line:
  - version `1.1.73`
  - Android build `74`
  - desktop release line `1.1.73`
- GitHub release tag:
  - `v1.1.73`

## What Is Already Live

- Restore/import merge now uses the selected file directly and no longer loses large JSON payloads.
- Restore/import now keeps restored local data and pushes it outward instead of immediately pulling stale remote data back over it.
- Variant split is now real, not just groundwork:
  - `org-client`
  - `central-admin`
- Android split behavior:
  - separate package/app identity for `org-client` and `central-admin`
- Desktop split behavior:
  - `Social Org Manager` opens org-client flow
  - `Org Registry Central Admin` opens admin flow
- Desktop org-client first-run now goes through `Org Connect`.
- Desktop central-admin opens admin login directly.
- Desktop org validation accepts matching email OR matching phone when both are provided.
- Password `Show / Hide` is available on login screens.
- Central Admin mobile/desktop Org Registry screens now support horizontal scrolling for:
  - registry list
  - edit form
- App close/reopen now returns to login instead of silently restoring the previous session.

## Recent Key Commits

- `28d9e0b` Release 1.1.73 restore sync fix
- `c5a6d2d` Add safe app variant scaffolding for org and admin builds
- `e2fd603` Tighten variant guards for org-client and admin tabs
- `48ae9a3` Add variant-aware update channel scaffolding
- `583ce64` Prepare desktop variant build identities and admin channels
- `8d667db` Split mobile variants and tighten admin session behavior
- `d1c9c42` Fix desktop variant routing and admin password sync
- `51a1692` Fix desktop admin password and org connect flow
- `18b45ba` Fix desktop entry routes and org connect validation

## Current Release Assets

- Org Client APK:
  - `social-org-manager-org-client-v1.1.73-202604250402.apk`
- Central Admin APK:
  - `org-registry-central-admin-v1.1.73-202604250447.apk`
- Org Client EXE:
  - `Social-Org-Manager-Setup-v1.1.73.exe`
- Central Admin EXE:
  - `Org-Registry-Central-Admin-Setup-v1.1.73.exe`

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

Current live baseline:
- release line: 1.1.73
- live commit: 18b45bae78485455e2c978f63010af637d400516
- GitHub tag: v1.1.73

Continue from:
1) any unresolved QA on org-client / central-admin split
2) release maintenance, restore safety, and sync verification
3) without undoing deployed desktop/mobile fixes
```

## Immediate Next Tasks (If Continuing Now)

1. Run final manual QA on both desktop EXEs after latest `18b45ba` fixes.
2. Decide whether web should stay unified or get dedicated `org-client` / `central-admin` URLs.
3. Record screenshot evidence for the split release line.
