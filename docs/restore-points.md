# Restore Points

_Last updated: 2026-04-24 (Asia/Rangoon)_

## Stable Checkpoints

| Label | Date | Branch | Commit | Tag | Notes |
|---|---|---|---|---|---|
| Variant Desktop/Admin Groundwork | 2026-04-24 | `deploy-fix` | `583ce64` | `restore-point-2026-04-24-variant-desktop-admin-groundwork` | Local-only checkpoint after dynamic desktop variant identity, admin desktop update channel placeholders, and variant-aware electron builder config. |
| Variant Update Channel Groundwork | 2026-04-24 | `deploy-fix` | `48ae9a3` | `restore-point-2026-04-24-variant-update-channel-groundwork` | Local-only checkpoint after variant-aware APK/desktop update metadata resolution with fallback to default update JSON files. |
| Variant Route Guard Groundwork | 2026-04-24 | `deploy-fix` | `e2fd603` | `restore-point-2026-04-24-variant-route-guard-groundwork` | Local-only checkpoint after `/system` route and dashboard admin entry were tightened for `org-client` / `central-admin` variants without changing unified live behavior. |
| Variant Scaffold Foundation | 2026-04-24 | `deploy-fix` | `c5a6d2d` | `restore-point-2026-04-24-variant-scaffold-foundation` | Local-only checkpoint after app variant runtime/build scaffolding was introduced with default `unified` behavior preserved. |
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

## Local Variant Groundwork Notes

- Tags dated `2026-04-24` after `pre-variant-split` are local groundwork checkpoints and have not been pushed/deployed yet.
- Use these when continuing the app split work without disturbing the current production release line.
- For production rollback, prefer `restore-point-2026-04-24-pre-variant-split` or older release-aligned tags unless the newer groundwork has been fully validated and deployed.
