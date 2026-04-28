# Restore Points

_Last updated: 2026-04-28 (Asia/Rangoon)_

## Stable Checkpoints

| Label | Date | Branch | Commit | Tag | Notes |
|---|---|---|---|---|---|
| Variant Desktop/Admin Groundwork | 2026-04-24 | `deploy-fix` | `583ce64` | `restore-point-2026-04-24-variant-desktop-admin-groundwork` | Groundwork checkpoint after dynamic desktop variant identity and admin desktop channel preparation. |
| Variant Update Channel Groundwork | 2026-04-24 | `deploy-fix` | `48ae9a3` | `restore-point-2026-04-24-variant-update-channel-groundwork` | Groundwork checkpoint after variant-aware APK/desktop update metadata resolution. |
| Variant Route Guard Groundwork | 2026-04-24 | `deploy-fix` | `e2fd603` | `restore-point-2026-04-24-variant-route-guard-groundwork` | Groundwork checkpoint after `/system` and admin entry tightening for split variants. |
| Variant Scaffold Foundation | 2026-04-24 | `deploy-fix` | `c5a6d2d` | `restore-point-2026-04-24-variant-scaffold-foundation` | Foundation checkpoint after app variant runtime/build scaffolding was introduced. |
| Pre Variant Split Prep | 2026-04-24 | `deploy-fix` | `28d9e0b` | `restore-point-2026-04-24-pre-variant-split` | Release-aligned checkpoint before the split rollout work began. |
| Part7 Mobile Stable | 2026-04-23 | `deploy-fix` | `3884dc4` | `restore-point-2026-04-23-part7-mobile-stable` | Includes org-connect stabilization and early `1.1.72/73` release alignment. |
| Part6 Stable | 2026-04-21 | `deploy-fix` | `80f3e52` | `restore-point-2026-04-21-part6-stable` | Includes Render LFS deploy fix, ORG001 recovery flow, and chairperson backup/restore access. |

## Current Live Progression After Restore Tags

These later commits are important operational milestones, but they are not tagged restore points yet:

- `8d667db` Split mobile variants and tighten admin session behavior
- `d1c9c42` Fix desktop variant routing and admin password sync
- `51a1692` Fix desktop admin password and org connect flow
- `18b45ba` Fix desktop entry routes and org connect validation
- `4c485ca` Central admin login cleanup, multi-admin support, and v1.1.74 desktop channel bump
- `7aae921` Publish Central Admin APK v1.1.74 update channel
- `48b2a70` Ignore local Gradle cache and build artifacts
- `772c4bd` Add dedicated admin user management page and profile controls
- `403c2bc` Refresh Central Admin APK/desktop update channels after new builds

Latest verified deployed commit before this doc refresh:

- `403c2bce1b88fff82a585ae39ce42a43b29f8504`

## How To Roll Back To A Restore Point (Safe Path)

1. Fetch latest refs:
   - `git fetch --all --tags`
2. Create a rollback branch from restore point:
   - `git checkout -b rollback-part6-stable restore-point-2026-04-21-part6-stable`
3. Validate locally and deploy that rollback branch/commit in Render first.
4. Only perform force-move/force-push operations with explicit team approval.

## Render Rollback

1. In Render, select branch `deploy-fix`.
2. Deploy the commit tied to the target restore point tag or known-good later milestone commit.
3. Confirm by opening:
   - `/api/sync/health`
4. Verify `commitHash` matches the intended rollback target.

## Guidance

- For release-aligned rollback before split behavior, prefer:
  - `restore-point-2026-04-24-pre-variant-split`
- For continuing split work without going all the way back, the later milestone commits above may be more practical than the older restore tags.
- Current release note:
  - update channels and GitHub latest release tag are aligned on `v1.1.74`
