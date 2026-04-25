# Project Handover & Maintenance Guide

Last updated: 2026-04-26  
Current app version: `1.1.73`  
Android versionCode: `74`  
Active maintenance branch: `deploy-fix`  
Latest verified live commit before this doc refresh: `18b45bae78485455e2c978f63010af637d400516`

## Current Stable State

- `/system` admin route remains reachable for admin-capable flows.
- ORG data isolation remains active (`ORG001` / `ORG002` scoped storage).
- Restore/import selected-file flow is fixed and safe for large backups.
- Restore/import now keeps restored local state instead of immediately losing it to stale remote pull.
- `org-client` and `central-admin` split behavior is active for mobile/desktop release artifacts.
- Desktop org-client and central-admin entry flows are separated.
- Desktop password `Show / Hide` is available.
- App relaunch returns to login instead of silently resuming prior authenticated session.
- Central Admin mobile registry/edit screens are usable on narrow screens via horizontal scrolling.

## Release Line

- Current release tag: `v1.1.73`
- Current important assets:
  - `social-org-manager-org-client-v1.1.73-202604250402.apk`
  - `org-registry-central-admin-v1.1.73-202604250447.apk`
  - `Social-Org-Manager-Setup-v1.1.73.exe`
  - `Org-Registry-Central-Admin-Setup-v1.1.73.exe`

## Build Variants

Supported variants:

- `unified`
- `org-client`
- `central-admin`

Current practical status:

- `unified`
  - legacy-compatible default behavior
- `org-client`
  - hides admin entry
  - blocks `/system`
  - expects org binding / `Org Connect`
- `central-admin`
  - dedicated central registry/admin flow

Variant build commands:

```bash
npm run variant:org-client:web
npm run variant:central-admin:web
npm run variant:org-client:apk
npm run variant:central-admin:apk
npm run variant:org-client:desktop:release
npm run variant:central-admin:desktop:release
```

## Important Maintenance Areas

### Restore / Import

- Main UI:
  - `app/data-management.tsx`
- Key behavior:
  - use selected file content directly
  - preserve restored local state
  - push restored state outward instead of pulling stale remote over it

### Variant Routing / Identity

- Variant helper:
  - `lib/app-variant.ts`
- Root routing:
  - `app/_layout.tsx`
- Desktop bootstrap:
  - `desktop/main.cjs`

### Auth / Session

- Auth context:
  - `lib/AuthContext.tsx`
- User login:
  - `app/sign-in.tsx`
- Admin login:
  - `app/admin-sign-in.tsx`

### Org Connect / Registry

- Org connect screen:
  - `app/org-connect.tsx`
- Registry logic:
  - `lib/org-registry.ts`
- Central admin system screen:
  - `app/(tabs)/system.tsx`

### Update Metadata

- Mobile default:
  - `server/config/app-update.json`
- Desktop default:
  - `server/config/desktop-update.json`
- Variant-specific:
  - `server/config/app-update.org-client.json`
  - `server/config/app-update.central-admin.json`
  - `server/config/desktop-update.org-client.json`
  - `server/config/desktop-update.central-admin.json`

## Release Hygiene

- Avoid committing large release binaries to the app deploy branch unless intentionally needed.
- Prefer local artifacts in `releases/`, `releases-desktop/`, and `variant-builds/` to remain untracked.
- After any deploy, verify:
  - `/api/sync/health`

## Recommended Ongoing Checks

1. Validate desktop org-client first-run enters `Org Connect`.
2. Validate desktop central-admin opens admin login.
3. Validate split APKs install as separate apps.
4. Validate restore/import on ORG-scoped data before any major rollout.
