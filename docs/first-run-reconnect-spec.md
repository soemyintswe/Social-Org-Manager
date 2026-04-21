# Org First-Run / Reconnect Specification (APK / EXE / Web)

_Last updated: 2026-04-22 (Asia/Rangoon)_

## 1) Purpose

ဒီ spec သည် Social Org Manager ကို အသင်းအဖွဲ့အလိုက် (`OrgID`) ဖြန့်ဝေသုံးစွဲရာတွင်:

- First install/first open စဉ် `Org Connect` ကို မဖြစ်မနေ ဖြတ်သန်းရန်
- OS-level data clear / cache clean ဖြစ်လျှင် `Org Connect` ကို ပြန်လုပ်ရန်
- Cloud data ကို local clear ကြောင့် မဖျက်မိစေရန်
- App-level `System Reset` / `Backup & Restore` ကို policy အတိုင်းသာ run စေရန်

အတွက် single source of truth guideline အဖြစ် သတ်မှတ်ထားသည်။

## 2) Scope

In scope:

- APK (Android), EXE (Desktop), Web runtime behavior
- Org binding lifecycle (`Unbound` -> `Bound`)
- Login gate by org context
- Local reset vs cloud persistence boundary

Out of scope:

- Registry schema redesign
- Cloud provider migration
- New authentication protocol (SSO/OAuth)

## 3) Key Rules (Authoritative)

1. App instance တစ်ခုသည် `OrgID` တစ်ခုနှင့် bound ဖြစ်ပြီးနောက် အဲဒီ `OrgID` context ဖြင့်သာ အသုံးပြုရမည်။
2. OS-level app data clear / cache clean ပြုလုပ်ပါက local org binding ပျက်သွားနိုင်သဖြင့် `Org Connect` ကို ပြန်လုပ်ရမည်။
3. OS-level clear သည် **cloud data deletion မဖြစ်ရ**။ Cloud snapshot/records မပျက်ရ။
4. App အတွင်း `System Reset` နှင့် `Backup & Restore` သည် app permission/policy အတိုင်းသာ လုပ်ဆောင်ရမည် (admin-only / org-scoped boundaries မချိုးရ)။
5. `/system` admin route reachability ကို မဖျက်ရ။
6. ORG isolation (`ORG001`/`ORG002`...) ကို local storage, sync payload, cloud folder, server snapshot အဆင့်အားလုံးတွင် တစ်ညီတစ်ညွတ်ထားရမည်။

## 4) Runtime State Model

- `S0: Unbound`
  - Local တွင် active `OrgID` မရှိ
  - Allowed route: `/org-connect` (except admin/system special routes)
- `S1: Bound / Not Authenticated`
  - `OrgID` persisted
  - User login မဝင်ရသေး
  - Allowed route: `/sign-in` (org context required)
- `S2: Bound / Authenticated`
  - `OrgID` persisted + valid session
  - App normal usage
- `S3: Blocked`
  - license/device/registry restriction
  - login/use blocked until admin action

Transition summary:

- First install -> `S0`
- `Org Connect` success -> `S1`
- Valid login -> `S2`
- Sign out -> `S1`
- OS data clear/cache clean -> `S0`
- App `System Reset` -> `S1` (org binding preserved by design)

## 5) Current Code Alignment (Already Implemented)

- Org binding storage context:
  - `lib/org-storage.ts`
  - keys: `@orghub_active_org_id`, `@orghub_last_connected_org_id`
- First-run gate + route redirect:
  - `app/_layout.tsx`
  - org setup required state -> redirect to `/org-connect`
- Org connect flow:
  - `app/org-connect.tsx`
  - registry credential verify + chair bootstrap + org-scoped context persist
- Sign-in org hydration:
  - `app/sign-in.tsx`
  - `orgId` query/restore + scoped migration + registry hydration
- App-level reset behavior:
  - `lib/storage.ts` `clearAllLocalDataKeepSystemConfig()`
  - preserves org/system config, clears app data set

## 6) Platform Behavior Contract

### APK (Android)

- `Clear storage / clear cache` by OS:
  - local AsyncStorage/device cache lost
  - next launch must start from `S0` and require `Org Connect`
- Cloud data:
  - must remain intact (no remote delete side effect)

### EXE (Desktop)

- user profile/browser storage (`userData` / local storage) cleared:
  - app returns to `S0` -> re-connect required
- embedded local snapshot may disappear per host machine state
- central cloud copy must remain source-of-truth

### Web

- browser storage/site data cleared:
  - app returns to `S0` -> re-connect required
- `/<ORGID>` deep-link and `orgId` query may prefill context, but must still pass connect/login rules

## 7) Data Boundary Rules

Local-only destructive events (allowed):

- OS app data clear / cache clean
- App `System Reset` (according to permission)

Cloud-destructive events (must not happen implicitly):

- any remote delete/overwrite triggered only because device cache was cleared
- cross-org restore/sync overwrite

Restore/sync guard:

- backup payload `orgId` must match active org
- mismatch -> reject by default (no silent import)

## 8) Permission & Security Rules

- System Admin:
  - central settings, registry, system reset, route `/system`
- Chairperson:
  - org-scoped backup/restore allowed
  - cannot perform global system reset unless explicitly granted
- Member users:
  - only assigned username/password for the bound org

Mandatory checks:

- org license active check before login/use
- device authorization check where enabled
- no admin credential login from member sign-in route

## 9) Code-Ready Implementation Checklist

### A. Routing / Gate

1. Ensure `orgSetupRequired` gating always routes `S0 -> /org-connect`.
2. Keep `/system` reachable for admin routes; do not regress to forced org-connect loop for admin entry.
3. Ensure non-admin unauthenticated users cannot bypass org binding through direct tab URLs.

Files:

- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`

### B. Org Connect Persistence

1. Persist active + last connected org keys on all platforms after successful verify.
2. Keep web session/local storage fallback consistent.
3. On reconnect, refresh managed config and chair bootstrap safely.

Files:

- `app/org-connect.tsx`
- `lib/org-storage.ts`
- `lib/org-registry.ts`

### C. Login Hydration

1. `sign-in` must resolve org context from query/restored/settings deterministically.
2. If org context missing after clear, never allow normal login attempt before reconnect.
3. Keep legacy migration guard non-destructive (merge/threshold safe mode).

Files:

- `app/sign-in.tsx`
- `lib/storage.ts`

### D. Reset Semantics

1. OS-level clear behavior documented as reconnect-required.
2. App `System Reset` remains policy-driven and does not break central/admin config unexpectedly.
3. No implicit remote delete from local clear/reset paths.

Files:

- `lib/storage.ts`
- `app/data-management.tsx`
- `app/(tabs)/system.tsx`

### E. Org Isolation Verification

1. Snapshot read/write must require `orgId`.
2. Sync health check remains available (`/api/sync/health`) for deployed commit verification.
3. Org scope metadata must match active org for restore/import/sync operations.

Files:

- `server/routes.ts`
- `scripts/sync/verify-org-sync-isolation.ps1`
- `scripts/deploy/verify-render-deploy-commit.ps1`

## 10) Acceptance Criteria (Release Gate)

1. Fresh install (APK/EXE/Web): user cannot proceed to member login without successful `Org Connect`.
2. After successful connect, only credentials for that org can login.
3. After OS data clear/cache clean, app requires reconnect (`S0`) and previous org data rehydrates from cloud after login/sync.
4. Cloud data remains unchanged by local clear action.
5. `System Reset` from app follows permission rules and does not grant unauthorized cross-org effects.
6. `/system` route remains reachable for system admin.
7. `/api/sync/health` commit hash verification succeeds after deployment.

## 11) Regression Test Matrix (Minimum)

Per platform (`APK`, `EXE`, `Web`) run:

1. First-run connect + chair login
2. Member login (valid/invalid/inactive)
3. OS-level clear data -> reconnect required
4. Reconnect same org -> cloud snapshot pull -> member count/user count restored
5. Cross-org protection check (`ORG001` device cannot login with `ORG002` credentials without reconnect)
6. Admin `/system` route entry and data-management access

Detailed execution checklist:

- `docs/org-reconnect-smoke-test-matrix.md`

## 12) Operational Notes

- Deploy branch must not include release APK binaries.
- After each deploy, verify:
  - `GET /api/sync/health`
  - commit hash equals latest `deploy-fix` commit.
- Keep per-org backup files and include org token in filename (`orghub_backup_<ORGID>_<timestamp>.json`).
