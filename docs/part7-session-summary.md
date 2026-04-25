# Part 7 Session Summary

_Last updated: 2026-04-26 (Asia/Rangoon)_

## Scope

This session range ended up covering much more than the original Part 7 release work. It now includes:

- release automation completion
- restore/import reliability fixes
- production sync safety fixes
- variant split rollout (`org-client` / `central-admin`)
- Android package separation
- desktop split routing and login fixes
- central admin mobile usability fixes

## What Was Fixed

### Release + Deploy

- Release line advanced to `1.1.73`.
- GitHub release tag `v1.1.73` was normalized and updated with current APK/EXE assets.
- Render deploy verification was repeatedly checked through `/api/sync/health`.

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

## Deployment Verification

- Production `/api/sync/health` was verified against the current deployed commit.
- Latest verified live commit before this doc refresh:
  - `18b45bae78485455e2c978f63010af637d400516`

## Release Asset Status

- GitHub release tag:
  - `v1.1.73`
- Current variant assets on `v1.1.73` include:
  - `social-org-manager-org-client-v1.1.73-202604250402.apk`
  - `org-registry-central-admin-v1.1.73-202604250447.apk`
  - `Social-Org-Manager-Setup-v1.1.73.exe`
  - `Social-Org-Manager-Setup-v1.1.73.exe.blockmap`
  - `Org-Registry-Central-Admin-Setup-v1.1.73.exe`
  - `Org-Registry-Central-Admin-Setup-v1.1.73.exe.blockmap`

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
3. Re-test latest desktop EXEs on a clean machine/profile if release confidence is needed.
4. Decide whether web should remain unified or split into dedicated org/admin URLs.
