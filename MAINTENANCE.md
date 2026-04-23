# Project Handover & Maintenance Guide

Last updated: 2026-04-24  
Current app version: `1.1.73`  
Android versionCode: `74`  
Active maintenance branch: `deploy-fix`  
Latest stable restore point tag: `restore-point-2026-04-24-pre-variant-split` (commit `28d9e0bb4208292d1e43a790d730d1fc7132f6ec`)

## Current Stable State (Part 7)

- `/system` admin route is reachable and guarded correctly.
- ORG data isolation is active (`ORG001` / `ORG002` scoped storage).
- ORG001 recovery path validated (member count restored to `65` in verified run).
- Data Management route (`/data-management`) is reachable for:
  - System Admin
  - Chairperson (org-scoped backup/restore only)
- `System Reset` remains admin-only.
- Backup export filename includes OrgID:
  - `orghub_backup_<ORGID>_<timestamp>.json`
- Render deploy health can be verified from:
  - `/api/sync/health`
- Org Connect startup flicker/route bounce mitigation is applied in startup routing.
- Android auto-update check now runs pre-login (app can prompt update before sign-in).
- Build variants scaffolding is in place:
  - `unified` = current live behavior
  - `org-client` = hides admin entry/system management
  - `central-admin` = dedicated central registry/admin flow

## Project Overview

`Social Org Manager (OrgHub)` သည် offline-first organization management app ဖြစ်ပြီး mobile + web နှစ်မျိုးလုံးအသုံးပြုနိုင်ပါတယ်။  
အဓိကလုပ်ဆောင်နိုင်ချက်များ:

- Member management (profile, family info, status/role)
- Finance records (income/expense, transfer, loan, reports)
- Expense claims, payment requests, audit workflows
- Events, comments, reactions, direct/group messages
- Role-based access control
- Backup/Restore (JSON), LAN Sync, Google Apps Script Cloud Sync
- In-app app update check + APK download/install flow
- Org registry + Org Connect flow with scoped storage and managed sync behavior

## Tech Stack & Dependencies

Programming language:

- TypeScript
- JavaScript (build scripts)

Framework / runtime:

- React Native `0.81`
- Expo SDK `54`
- Expo Router
- Node.js + Express (LAN sync/API server)

Client state/data:

- React Context (`lib/DataContext.tsx`, `lib/AuthContext.tsx`)
- AsyncStorage (local persistent data)

Key libraries:

- `@react-native-async-storage/async-storage`
- `expo-router`, `expo-file-system`, `expo-sharing`, `expo-intent-launcher`
- `expo-print`, `expo-image-picker`, `expo-camera`, `expo-notifications`
- `@react-native-firebase/remote-config`
- `react-native-qrcode-svg`
- `express`, `express-rate-limit`

## Project Structure

| Path | Purpose |
|---|---|
| `app/` | Expo Router screens (all pages/forms/workflows) |
| `app/(tabs)/` | Main tabs: dashboard, finance, reports, system |
| `app/_layout.tsx` | Global app shell, auth routing, auto-update modal/check |
| `components/` | Shared UI components (`FloatingTabMenu`, guards, keyboard helpers) |
| `constants/colors.ts` | Theme colors |
| `lib/types.ts` | Core data models/types |
| `lib/storage.ts` | Data persistence, migrations, sync helpers, workflow operations |
| `lib/DataContext.tsx` | App data actions + state orchestration |
| `lib/AuthContext.tsx` | Login/session/profile/permission state |
| `lib/access-control.ts` | Permission rules by role |
| `lib/app-update.ts` | Update check logic (LAN -> Remote Config/GitHub fallback) |
| `server/index.ts` | Express server bootstrap (CORS, rate-limit, routes) |
| `server/routes.ts` | `/api/sync/*`, `/api/cloud-sync/proxy`, `/api/app-update` |
| `server/config/app-update.json` | Auto-update metadata for latest APK |
| `scripts/build-apk.js` | Android release APK build + update config auto-refresh |
| `scripts/cleanup-releases.js` | Keeps only recent APK artifacts in `releases/` |
| `scripts/release/upload-release-assets.js` | Upload APK + Desktop EXE assets to GitHub Release tag (`--clobber`) |
| `releases/` | Local built APK files (release artifacts, do not commit on deploy branch) |
| `docs/` | Session summaries, restore points, deploy notes, cloud sync docs |

## Release Cleanup Policy

- Keep only one APK per app version in local `releases/`
- Do not commit large APK artifacts to `deploy-fix` (prevents Render/LFS deploy failures)
- `scripts/build-apk.js` runs cleanup automatically after every successful build
- If you need to keep more versions temporarily, set `RELEASES_KEEP_VERSIONS` before building

## Step-by-Step Setup

### 1) Prerequisites

- Node.js 20 LTS recommended
- npm
- Java 17 + Android SDK/Platform tools (for APK build)
- Android Studio (if native Android build needed)

### 2) Install dependencies

```bash
npm install
```

### 3) Run app (development)

- Expo dev server:

```bash
npm start
```

- Android dev run:

```bash
npm run android
```

- Web run:

```bash
npx expo start --web
```

### 4) Run LAN sync/API server (optional but recommended for sync/update API)

```bash
npm run server:lan
```

### 5) Lint checks

```bash
npm run lint
```

### 6) Build APK (release)

```bash
node scripts/build-apk.js
```

This script automatically:

- reads version from `app.json` / `package.json`
- syncs `android/app/build.gradle` (`versionCode`, `versionName`)
- builds release APK
- copies APK to `releases/`
- updates `server/config/app-update.json` (`latestVersion`, `latestBuildNumber`, `downloadUrl`, `publishedAt`)

Important for deploy:

- Deploy branch (`deploy-fix`) should exclude tracked APK binaries.
- After deploy, verify live commit via `/api/sync/health`.

## Build Variants

Current safe default:

- If `APP_VARIANT` is not set, app runs as `unified`
- `unified` is the current production-compatible mode and keeps existing behavior

Available variants:

- `APP_VARIANT=unified`
- `APP_VARIANT=org-client`
- `APP_VARIANT=central-admin`

Variant build commands:

```bash
npm run variant:org-client:web
npm run variant:central-admin:web
npm run variant:org-client:apk
npm run variant:central-admin:apk
npm run variant:org-client:desktop:release
npm run variant:central-admin:desktop:release
```

Current separation status:

- `org-client` hides `System Admin Login`
- `org-client` blocks `/system`
- `central-admin` uses dedicated app identity from `app.config.js`
- Default `unified` build remains unchanged until dedicated release channels are finalized

## Common Maintenance Tasks

### A) UI text/labels change

Edit screen files in `app/` and `app/(tabs)/`.

- Dashboard quick actions: `app/(tabs)/index.tsx`
- Finance labels/cards: `app/(tabs)/finance.tsx`
- Reports labels/print labels: `app/(tabs)/reports.tsx`
- System/update labels: `app/(tabs)/system.tsx`, `app/_layout.tsx`

### B) Color/theme change

- Global palette: `constants/colors.ts`
- Screen-specific styles: each screen file’s `StyleSheet`

### C) Member model/status/role logic change

- Type changes: `lib/types.ts`
- Persistence/migration logic: `lib/storage.ts`
- Permissions: `lib/access-control.ts`
- Auth profile mapping: `lib/AuthContext.tsx`
- Member forms: `app/add-member.tsx`, `app/member-detail.tsx`

Important:

- `Member.orgPositionHistory` is used for period-aware reporting.
- If changing role/status flow, update both storage normalization and reporting logic.

### D) Reports filter/print changes

- Main logic: `app/(tabs)/reports.tsx`
- Member period overlap + executive timeline logic is in this file.
- Print output templates are generated in the same file.

### E) Finance/loan calculation changes

- Transaction/loan storage actions: `lib/storage.ts`
- Loan metrics helpers: `lib/loan-metrics.ts`
- UI screens: `app/(tabs)/finance.tsx`, `app/loans.tsx`, `app/(tabs)/reports.tsx`

### F) Auto update behavior changes

- Runtime check + modal/install flow: `app/_layout.tsx`
- Update check source selection + version compare: `lib/app-update.ts`
- Server response endpoint: `server/routes.ts` (`/api/app-update`)
- Published latest metadata: `server/config/app-update.json`
- Desktop update metadata + endpoint:
  - `server/config/desktop-update.json`
  - `server/routes.ts` (`/api/desktop-update`)
  - Electron update check prompt: `desktop/main.cjs`

### G) Startup performance tuning

- App startup blocking points: `app/_layout.tsx`
- Heavy operations should be deferred until after initial render/interactions.

### H) Keyboard overlap/form UX fixes

- Use keyboard-aware wrappers/components
- Reference:
  - `components/KeyboardAwareScrollViewCompat.tsx`
  - `lib/use-keyboard-inset.ts`
  - affected form screens in `app/`

## Release & Version Control Checklist

1. Update versions:
   - `app.json` -> `expo.version`, `expo.android.versionCode`
   - `package.json` -> `version`
2. Run:
   - `node scripts/build-apk.js`
3. Verify generated artifact in local `releases/`
4. Confirm `server/config/app-update.json` fields are correct
5. Commit + push branch (`deploy-fix`)
6. Verify Render live commit by checking `/api/sync/health`
7. Test update flow from old APK to new APK on real device
8. Desktop release metadata refresh:
   - `npm run desktop:update-config`
9. Upload APK + EXE to GitHub Release tag:
   - `npm run release:upload-assets`
10. Verify Render deployed commit hash (optional in same flow):
   - `npm run release:upload-assets:verify-render`
   - or `npm run deploy:verify-render`
11. Verify download URLs in:
   - `server/config/app-update.json`
   - `server/config/desktop-update.json`

## Data/Security Guardrails

- Do not commit real member private data, backup dumps, or local DB files with personal data.
- Do not commit release APK binaries to deploy branch (`deploy-fix`).
- Keep secrets/keys out of source code.
- Validate role-based access when changing workflow logic.
- When adding new stored fields in `types.ts`, always add normalization/migration in `storage.ts`.

## Required Read Order For New Chat

Before starting any new coding chat, read these first:

1. `PROJECT_SELF_AUDIT.md`
2. `docs/part7-session-summary.md`
3. `docs/part6-session-summary.md`
4. `docs/restore-points.md`
5. `MAINTENANCE.md`
6. `docs/new-chat-starter.md`
7. `docs/first-run-reconnect-spec.md`
8. `docs/org-reconnect-smoke-test-matrix.md`

## Future AI Prompting Guide

Use the following context template when asking AI:

```text
Project: Social Org Manager (Expo React Native + TypeScript)
Branch: <branch-name>
Platform: Android / Web
Goal: <what you want>
Constraints: Keep existing workflows stable, avoid data loss, keep Burmese labels.
Files likely related: <list paths>
What I already tried: <steps>
Expected behavior: <clear acceptance criteria>
```

### Prompt Example 1: Bug Fix

```text
Fix startup delay in Social Org Manager.
Focus files: app/_layout.tsx, lib/app-update.ts.
Requirement: app should render fast first, then check update in background.
Do code changes + lint + summary.
```

### Prompt Example 2: New Feature

```text
Add a new member report filter for "age 18-25" with print support.
Focus file: app/(tabs)/reports.tsx.
Keep current report tabs and existing Burmese labels unchanged.
```

### Prompt Example 3: Data Model Change

```text
Add a new member field and migrate old data safely.
Update types, storage normalization/migration, form inputs, and report display.
Files: lib/types.ts, lib/storage.ts, app/add-member.tsx, app/member-detail.tsx, app/(tabs)/reports.tsx.
```

### Prompt Example 4: Release Task

```text
Prepare release build and auto-update metadata.
Bump app version + versionCode, run scripts/build-apk.js, verify server/config/app-update.json, then commit and push.
```

### Prompt Example 5: Safe Review

```text
Do a code review for regression risks only.
Prioritize: data consistency, permission leaks, and report correctness.
List findings with file + line references.
```

### Prompt Example 6: Continue From Latest Stable State

```text
Please read:
1) PROJECT_SELF_AUDIT.md
2) docs/part7-session-summary.md
3) docs/part6-session-summary.md
4) docs/restore-points.md
5) MAINTENANCE.md

Work on branch: deploy-fix
Priorities:
- protect existing org data (no destructive resets)
- keep admin route reachable at /system
- keep strict org isolation (ORG001/ORG002)
- verify Render deployed commit from /api/sync/health
Then continue only from unresolved items.
```

## Quick Troubleshooting

- Update loop issue:
  - Check `app.json` version/versionCode incremented
  - Check `server/config/app-update.json` `latestBuildNumber` and `downloadUrl`
  - Confirm installed APK package id is same
- `/data-management` page not opening:
  - Verify deployed commit from `/api/sync/health`
  - Ensure user role is System Admin or Chairperson (chairperson has org-scoped access only)
- OS data clear / cache clean ပြီး login မဝင်နိုင်:
  - App ကို `Org Connect` ပြန်လုပ်ပြီး ORG ID ဖြင့်ပြန်ချိတ်ပါ
  - Org ချိတ်ပြီးနောက် သက်ဆိုင်ရာ username/password ဖြင့် login ဝင်ပါ
  - Cloud sync endpoint အချက်အလက်များ (`cloudSyncEndpoint`, `cloudSyncFolderName`) ပြန်တင်ထားမှုစစ်ပါ
  - Full platform QA checklist: `docs/org-reconnect-smoke-test-matrix.md`
- Web print empty:
  - Re-check print flow in `app/(tabs)/reports.tsx`
- Member report wrong for historical executive roles:
  - Ensure member has correct `orgPositionHistory` entries in storage data
