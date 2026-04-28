# Part 7 Session Summary

_Last updated: 2026-04-28 (Asia/Rangoon)_

## Scope

This session range ended up covering much more than the original Part 7 release work. It now includes:

- release automation completion
- restore/import reliability fixes
- production sync safety fixes
- variant split rollout (`org-client` / `central-admin`)
- Android package separation
- desktop split routing and login fixes
- central admin mobile usability fixes
- central admin login cleanup and multi-admin support
- dedicated admin user management page with profile controls

## What Was Fixed

### Release + Deploy

- Central admin update channel advanced to `1.1.74` (mobile/desktop configs).
- Render production currently serves commit `403c2bce1b88fff82a585ae39ce42a43b29f8504`.
- Render deploy verification was repeatedly checked through `/api/sync/health`.
- GitHub latest release tag is now `v1.1.74` and release assets were uploaded.

### Restore / Import Reliability

- Selected backup files are now used directly during restore/import instead of relying on pasted preview text.
- Restore/import no longer loses large payloads because of UI preview limitations.
- After restore/import, the app now refreshes from restored local state and pushes outward, instead of pulling stale remote state back over restored data.
- ORG001 financial data recovery path was successfully unblocked by these fixes.

### Variant Split

- Introduced and completed practical split behavior for:
  - `org-client`
  - `central-admin`
- `org-client` hides system-admin entry points and blocks `/system`.
- `central-admin` keeps central registry/admin behavior available.
- Variant-aware update metadata was added for mobile and desktop channels.

### Android

- `org-client` and `central-admin` APKs now install as separate apps instead of updating the same package.
- Variant-specific Android `google-services` handling was added for build compatibility.

### Desktop

- Desktop variant routing was hardened so:
  - `Social Org Manager` opens org-client flow
  - `Org Registry Central Admin` opens admin flow
- Desktop org-client first-run now requires `Org Connect`.
- Desktop central-admin opens admin login directly.
- Desktop admin password now follows the remote/current truth instead of stale local state.
- Desktop login pages now show a visible `Show / Hide` password toggle.
- Desktop org validation now accepts email OR phone match when both are present.

### Central Admin Login + Multi-Admin

- Removed outdated bottom action: `Org User Login သို့ ပြန်သွားမည်` from admin login context.
- Admin login username field is now blank by default (not fixed to `admin`).
- Admin login supports username/email style input.
- Multiple admin accounts can now be created and used for system management sharing.

### Dedicated Admin User Management Page

- Added dedicated menu/route page for admin account management (`/admin-users`).
- Added admin profile-style UI for each account with:
  - display name
  - email
  - phone
  - address
  - appointed date
  - account status and status note
- Added password reset workflow per admin profile.
- Added `Show / Hide` controls for password and confirm password in create/edit/reset forms.
- Kept legacy `admin` account as reserved/protected.

### Session / Auth

- App close/reopen now returns the user to login instead of silently preserving the previous session.

### Central Admin Mobile UX

- Org Registry list supports horizontal scroll on narrow screens.
- Org edit form also supports horizontal scroll and wider field layout, so long values can be edited properly.

## Key Commits (deploy-fix)

- `28d9e0b` Release 1.1.73 restore sync fix
- `c5a6d2d` Add safe app variant scaffolding for org and admin builds
- `e2fd603` Tighten variant guards for org-client and admin tabs
- `48ae9a3` Add variant-aware update channel scaffolding
- `583ce64` Prepare desktop variant build identities and admin channels
- `8d667db` Split mobile variants and tighten admin session behavior
- `d1c9c42` Fix desktop variant routing and admin password sync
- `51a1692` Fix desktop admin password and org connect flow
- `18b45ba` Fix desktop entry routes and org connect validation
- `4c485ca` Central admin login cleanup, multi-admin support, and v1.1.74 desktop channel bump
- `7aae921` Publish Central Admin APK v1.1.74 update channel
- `48b2a70` Ignore local Gradle cache and build artifacts
- `772c4bd` Add dedicated admin user management page and profile controls
- `403c2bc` Refresh Central Admin APK/desktop update channels after new builds

## Deployment Verification

- Production `/api/sync/health` was verified against the current deployed commit.
- Latest verified live commit before this doc refresh:
  - `403c2bce1b88fff82a585ae39ce42a43b29f8504`

## Release Asset Status

- GitHub `v1.1.74` now includes:
  - `social-org-manager-org-client-v1.1.74-202604280252.apk`
  - `Social-Org-Manager-Setup-v1.1.74.exe`
  - `org-registry-central-admin-v1.1.74-202604270302.apk`
  - `Org-Registry-Central-Admin-Setup-v1.1.74.exe`

## Watch Items / Unresolved

- Full automated regression suite is still missing.
- Web split strategy is not finalized yet:
  - unified-only web
  - separate path
  - separate subdomain/service
- Manual screenshot evidence for the final split release line should still be recorded.

## Recommended Next Session Start

1. Stay on branch `deploy-fix`.
2. Confirm `/api/sync/health` still matches current `HEAD`.
3. Re-test latest Central Admin APK/EXE on a clean machine/profile.
4. Re-test Org Client APK/EXE `1.1.74` on clean devices/profiles.
5. Decide whether web should remain unified or split into dedicated org/admin URLs.
