# Restore Points

_Last updated: 2026-04-24 (Asia/Rangoon)_

## Stable Checkpoints

| Label | Date | Branch | Commit | Tag | Notes |
|---|---|---|---|---|---|
| Pre Variant Split Prep | 2026-04-24 | `deploy-fix` | `28d9e0b` | `restore-point-2026-04-24-pre-variant-split` | Captures the current release-aligned state before introducing org-client / central-admin build separation scaffolding. |
| Part7 Mobile Stable | 2026-04-23 | `deploy-fix` | `3884dc4` | `restore-point-2026-04-23-part7-mobile-stable` | Includes org-connect flicker stabilization, pre-login update check, release metadata `1.1.72/73`, and render commit verification. |
| Part6 Stable | 2026-04-21 | `deploy-fix` | `80f3e52` | `restore-point-2026-04-21-part6-stable` | Includes Render LFS deploy fix, ORG001 recovery flow, chairperson backup/restore access, OrgID backup filename. |

## How To Roll Back To A Restore Point

1. Fetch latest refs:
   - `git fetch --all --tags`
2. Create a rollback branch from restore point:
   - `git checkout -b rollback-part6-stable restore-point-2026-04-21-part6-stable`
3. If you want `deploy-fix` to point there:
   - `git checkout deploy-fix`
   - `git reset --hard restore-point-2026-04-21-part6-stable`
   - `git push --force-with-lease origin deploy-fix`

## Render Rollback

1. In Render, select branch `deploy-fix`.
2. Deploy the commit tied to target restore point tag (latest: `restore-point-2026-04-23-part7-mobile-stable`).
3. Confirm by opening:
   - `/api/sync/health`
   - verify `commitHash` matches the restore-point commit.
