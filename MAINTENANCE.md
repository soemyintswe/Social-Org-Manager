# Project Handover & Maintenance Guide

Last updated: 2026-03-07  
Current app version: `1.1.47`  
Android versionCode: `48`

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
| `app/(tabs)/` | Main tabs: dashboard, finance, reports, groups, system |
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
| `releases/` | Built APK files (release artifacts) |
| `docs/` | Cloud sync and desktop usage docs |

## Release Cleanup Policy

- Keep only one APK per app version in `releases/`
- Keep only the latest `4` app versions in git
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
3. Verify generated artifact in `releases/`
4. Confirm `server/config/app-update.json` fields are correct
5. Commit + push branch
6. Test update flow from old APK to new APK on real device

## Data/Security Guardrails

- Do not commit real member private data, backup dumps, or local DB files with personal data.
- Keep secrets/keys out of source code.
- Validate role-based access when changing workflow logic.
- When adding new stored fields in `types.ts`, always add normalization/migration in `storage.ts`.

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

## Quick Troubleshooting

- Update loop issue:
  - Check `app.json` version/versionCode incremented
  - Check `server/config/app-update.json` `latestBuildNumber` and `downloadUrl`
  - Confirm installed APK package id is same
- Web print empty:
  - Re-check print flow in `app/(tabs)/reports.tsx`
- Member report wrong for historical executive roles:
  - Ensure member has correct `orgPositionHistory` entries in storage data
