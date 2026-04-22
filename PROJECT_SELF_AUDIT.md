# PROJECT_SELF_AUDIT

_Last updated: 2026-04-23 (Asia/Rangoon)_

## 1) Completed / Implemented

- System Admin architecture remains separated from org data storage via system-scoped keys (`@sysdb:*`).
- Org-scoped storage is active (`@orgdb:<ORGID>:`), and login/connect flow persists org context correctly on web and app.
- Admin routes are stable and reachable:
  - `/system`
  - `/data-management`
  - `/phone-transfer`
  - `/member-data-management`
  - `/import-members`
- Render deploy blocker was fixed by removing release APK artifacts from Git LFS tracking on deploy branch.
- ORG001 data recovery completed with safe restore flow from backup:
  - members restored to 65
  - users/password map restored and verified by login test
  - ORG isolation retained
- Chairperson can now access Data Backup/Restore from Account Settings without System Admin account.
- Chairperson Data Management is org-scoped in practice through active org storage context.
- System Reset remains admin-only.
- Backup export filename now includes OrgID for easier separation:
  - `orghub_backup_<ORGID>_<timestamp>.json`
- Pre-existing JSX parse blocker in `app/audit-change-requests.tsx` has been resolved.
- First-run/reconnect guard was hardened:
  - sign-in is blocked when valid org binding is missing
  - invalid org deep-link route now redirects to `/org-connect`
  - org-connect validates OrgID format (`ORG001` pattern).
- Org Connect startup flicker risk reduced:
  - removed duplicate auto-redirect in `app/org-connect.tsx`
  - unauthenticated route guard now allows staying on `/org-connect` without bounce loops
- Android auto-update check now runs before login as well (not only after authentication).
- Added platform QA checklist for reconnect validation:
  - `docs/org-reconnect-smoke-test-matrix.md`
- Added automation helper for quick reconnect baseline checks:
  - `scripts/sync/run-org-reconnect-smoke-lite.ps1`
- Desktop update check path added (version-controlled metadata):
  - `server/config/desktop-update.json`
  - `/api/desktop-update`
  - startup prompt in `desktop/main.cjs`
- GitHub release asset automation added for APK + Desktop EXE:
  - `scripts/release/upload-release-assets.js`
  - npm scripts:
    - `release:upload-assets`
    - `release:upload-assets:verify-render`
- Release prep updated to version `1.1.72` / Android build `73`; mobile APK metadata is live.
- Render deployed commit was re-verified after latest deploy-fix updates:
  - local `HEAD` and `/api/sync/health` commit hash matched (`3884dc4...`) in latest check.

## 2) In Progress / Watch Items

- Full automated regression suite is still missing; verification remains manual checklist based.
- Ops hygiene still recommended:
  - avoid committing large release binaries into app deploy branch
  - keep Render deployed commit aligned with latest `deploy-fix`.
- Version alignment still recommended:
  - desktop release stream is still on `1.1.71` while Android stream is `1.1.72`.

## 3) Restore Point Policy

- Use `docs/restore-points.md` as the source of truth for stable checkpoints.
- Latest stable checkpoint is recorded for Part 7 work and includes:
  - org-connect startup flicker stabilization
  - pre-login mobile update check behavior
  - release metadata sync to `1.1.72/73`
  - render commit verification alignment on `deploy-fix`.

## Recommended Next Sequence

1. Keep using per-org backup files (`ORG001`, `ORG002`) before any major change.
2. For any data restore, prefer `Import (Merge)` first and verify member/user counts.
3. Before production deploy, verify `/api/sync/health` commit hash equals latest `deploy-fix`.
4. If needed, return to the latest restore point tag from `docs/restore-points.md`.
