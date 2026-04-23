# New Chat Starter (Ready-to-Use)

_Last updated: 2026-04-23 (Asia/Rangoon)_

Use this file to continue work in a brand-new chat without losing context.

## Branch + Safety

- Branch: `deploy-fix`
- Hard constraints:
  - no destructive resets
  - keep `/system` reachable
  - keep strict ORG isolation (`ORG001` / `ORG002`)
  - verify deployed commit from `/api/sync/health` after deploy

## Current Baseline

- Latest deploy-fix commit: `b64d42a`
- Render health commit: matched with `b64d42a` in latest verification
- Mobile release line:
  - version `1.1.72`
  - build `73`
  - update metadata points to `release-lan-sync-v1.1.72-202604230241.apk`
- Desktop release line:
  - version `1.1.72`
  - build `72`
  - update metadata points to `Social-Org-Manager-Setup-v1.1.72.exe`
- Release tag policy:
  - clean semantic tag `v1.1.72` created
  - assets verified on tag:
    - `release-lan-sync-v1.1.72-202604230241.apk`
    - `Social-Org-Manager-Setup-v1.1.72.exe`
    - `Social-Org-Manager-Setup-v1.1.72.exe.blockmap`

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
- keep admin route reachable at /system
- keep strict org isolation (ORG001/ORG002)
- verify Render deployed commit from /api/sync/health

Then continue only from unresolved items in part7 summary.
```

## Immediate Next Tasks (If Continuing Now)

1. Run full manual org reconnect smoke checks on Android and Web (EXE optional), and record screenshot evidence.
2. Decide whether to keep legacy `v1.1.71` tag assets as history or prune mismatched legacy assets.
3. Add a new restore-point tag after QA sign-off for this release-aligned state.
