# PROJECT_SELF_AUDIT

_Last updated: 2026-04-15 (Asia/Rangoon)_

## 1) Completed / Implemented

- System Admin architecture was separated from org data storage using system-scoped storage keys (`@sysdb:*`) for admin-only state (password, registry cache, admin session related pieces).
- System Admin flow (`/system`) and org registry management UI were implemented with:
  - Org list/table view
  - Add/Edit/Detail actions
  - Org Connect launch action
  - Licensing fields (allow/deny + dates)
  - Technical fields (endpoint + API key + account email + folder)
- Firestore Registry integration is in place (read/list/save + cache fallback behavior when Firestore is unavailable).
- Org Connect flow is implemented (`/org-connect`):
  - Input = `OrgID + (Email or Phone)`
  - Registry verification + license validation
  - Chair bootstrap from registry (`ensureChairAccountFromRegistry`)
  - Persist active org context before sign-in.
- Org-scoped storage logic exists:
  - `@orgdb:<ORGID>:` key prefixing for org data
  - active org context persistence/restore across tab reloads (session/local fallback on web).
- Sync path has org-aware routing on server:
  - `/api/sync/snapshot?orgId=...`
  - per-org snapshot files under `server/data/orgs/<ORGID>/sync-snapshot.json`
- Added snapshot org-scope meta checks in sync flow to reduce cross-org overwrite risk.
- Added password reset workflows in multiple places:
  - Sign-in “forgot password”
  - Member detail “Password Reset”
  - Account Settings “User Password Reset (Chairperson)”
  - Auto-generated temporary password messaging in-app.
- Add-member flow improvements added:
  - duplicate member-id guard
  - save double-click guard
  - post-create password generation/reset flow.

## 2) In Progress / Still Unstable

- **Critical unresolved issue:** ORG001 still intermittently shows ORG000-sized dataset after sync/runtime in some scenarios.
  - Root symptom is data contamination from previously mixed snapshots (local/LAN/cloud).
  - Existing patches reduced some causes, but full stability is not yet guaranteed.
- Password reset “success message but login fail” is still observed in contaminated state and needs final verification after dataset cleanup.
- Member delete/reset actions were improved, but behavior is still inconsistent in some user-reported runs (first-click/no-op cases need final hardening + retest).
- License inactive popup can appear transiently on fresh cache clear before context/registry hydration completes; needs deterministic bootstrap order.

## 3) Missing For Complete End-to-End Flow (My Own Gap Analysis)

- A **hard org isolation cleanup tool** is still missing:
  - one-click purge for selected org scope (local keys + LAN snapshot + cloud snapshot) without touching other orgs.
- A **forced migration strategy** is missing for legacy unscope snapshots:
  - disable permissive legacy behavior once migration completes.
- A **strict org-cloud mapping guard** is missing in runtime:
  - prevent sync if endpoint/folder/account does not match active registry org.
- Reliable **server-side Email/SMS delivery service** is not complete.
  - Current behavior still depends on device/app handlers (`mailto:` / `sms:`) in many flows.
- Full **regression/E2E checklist automation** is missing (currently mostly manual verification).
- Security hardening is incomplete:
  - production Firestore rules + write restrictions for registry paths
  - audit trail for password reset/member delete actions.

## Recommended Immediate Next Sequence

1. Clean contaminated ORG001 data sources (local + LAN + cloud) with explicit org-scope reset.
2. Re-seed ORG001 from intended empty/clean snapshot (chair + expected members only).
3. Run controlled sync verification (`LAN pull/push`, `Cloud health/pull/push`) while monitoring org-scope meta.
4. Re-test password reset/login on ORG001 with known test accounts.
5. Freeze legacy fallback behavior after migration to avoid future re-mixing.
