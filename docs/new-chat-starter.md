# New Chat Starter (Ready-to-Use)

_Last updated: 2026-04-24 (Asia/Rangoon)_

Use this file to continue work in a brand-new chat without losing context.

## Branch + Safety

- Branch: `deploy-fix`
- Hard constraints:
  - no destructive resets
  - keep `/system` reachable
  - keep strict ORG isolation (`ORG001` / `ORG002`)
  - verify deployed commit from `/api/sync/health` after deploy

## Current Baseline

- Latest local `deploy-fix` commit: `aab5683`
- Latest Render health commit verified on production line: `c5a6d2d`
- Important distinction:
  - production-safe baseline remains the pre-variant-split release-aligned state
  - newer commits after `28d9e0b` are local variant-separation groundwork and have not been pushed/deployed
- Mobile release line:
  - version `1.1.73`
  - build `74`
  - default update metadata points to `release-lan-sync-v1.1.73-202604231112.apk`
- Desktop release line:
  - version `1.1.73`
  - build `73`
  - default update metadata points to `Social-Org-Manager-Setup-v1.1.73.exe`
- Release tag policy:
  - clean semantic tag `v1.1.73` created
  - assets verified on tag:
    - `release-lan-sync-v1.1.73-202604231112.apk`
    - `Social-Org-Manager-Setup-v1.1.73.exe`
    - `Social-Org-Manager-Setup-v1.1.73.exe.blockmap`

## Current Restore / Split State

- Production-safe restore point tag:
  - `restore-point-2026-04-24-pre-variant-split` -> `28d9e0b`
- Local variant groundwork checkpoints:
  - `restore-point-2026-04-24-variant-scaffold-foundation` -> `c5a6d2d`
  - `restore-point-2026-04-24-variant-route-guard-groundwork` -> `e2fd603`
  - `restore-point-2026-04-24-variant-update-channel-groundwork` -> `48ae9a3`
  - `restore-point-2026-04-24-variant-desktop-admin-groundwork` -> `583ce64`

## Local Variant Work Completed

- app variant runtime/build scaffolding added:
  - `unified`
  - `org-client`
  - `central-admin`
- `org-client` hides `System Admin Login`
- `org-client` blocks `/system`
- `central-admin` desktop identity / artifact naming groundwork added
- variant-aware update metadata fallback added:
  - `app-update.org-client.json`
  - `desktop-update.org-client.json`
  - `app-update.central-admin.json`
  - `desktop-update.central-admin.json`
- default `unified` production behavior intentionally preserved

## Must-Read Order

1. `PROJECT_SELF_AUDIT.md`
2. `docs/part7-session-summary.md`
3. `docs/part6-session-summary.md`
4. `docs/restore-points.md`
5. `MAINTENANCE.md`
6. `docs/first-run-reconnect-spec.md`
7. `docs/org-reconnect-smoke-test-matrix.md`

## Copy/Paste Prompt For New Chat

```text
Please read and follow, in order:
1) PROJECT_SELF_AUDIT.md
2) docs/part7-session-summary.md
3) docs/part6-session-summary.md
4) docs/restore-points.md
5) MAINTENANCE.md
6) docs/first-run-reconnect-spec.md
7) docs/org-reconnect-smoke-test-matrix.md

Work on branch: deploy-fix
Priorities:
- protect existing org data (no destructive resets)
- keep admin route reachable at /system in unified / central-admin flows
- keep strict org isolation (ORG001/ORG002)
- do not disturb current production release line unless explicitly ready to deploy
- verify Render deployed commit from /api/sync/health before and after any deploy

Then continue from:
1) unresolved items in part7 summary
2) local variant groundwork after `restore-point-2026-04-24-pre-variant-split`
3) without pushing/deploying until a release-ready split build is validated
```

## Immediate Next Tasks (If Continuing Now)

1. Produce local-only `org-client` APK/EXE builds and run manual QA without deploying.
2. Add central-admin web/app branding polish so the split is visually obvious.
3. Decide release-channel strategy for `unified` vs `org-client` vs `central-admin` before any push/deploy.
