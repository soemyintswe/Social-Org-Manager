# Org Reconnect Smoke Test Matrix (APK / EXE / Web)

Last updated: 2026-04-22  
Branch target: `deploy-fix`  
Goal: verify first-run/reconnect policy after local data clear/cache clean without cloud data loss.

## 1) Preconditions

1. Test orgs available:
   - `ORG001` (sample populated data)
   - `ORG002` (small isolated data)
2. At least one valid user account per org (chair + member).
3. Cloud sync endpoint configured and reachable for test org.
4. For deploy verification (web/server):
   - check `GET /api/sync/health`
   - ensure `commitHash` matches expected `deploy-fix` commit.

## 2) Common Expected Rules

1. Fresh install/open with no binding -> must require `Org Connect`.
2. After successful connect, login works only for that org context.
3. OS-level clear/cache clean -> app returns to `Org Connect` requirement.
4. Reconnect same org + login -> data restores from cloud/sync (no destructive empty state).
5. `ORG001` and `ORG002` remain isolated (no cross-org data leak).
6. `/system` remains reachable for admin path.

## 3) Platform Matrix

| Scenario | APK | EXE | Web |
|---|---|---|---|
| A. First-run require Org Connect | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL |
| B. Valid org connect + login | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL |
| C. Wrong org credential/login blocked | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL |
| D. Data clear/cache clean -> Org Connect required again | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL |
| E. Reconnect + cloud recover member/user counts | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL |
| F. ORG001/ORG002 isolation after reconnect | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL |
| G. Admin `/system` reachable | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL | ☐ PASS / ☐ FAIL |

## 4) Detailed Steps (Run Per Platform)

### A) First-run Gate

1. Install/open app in clean state.
2. Try direct access to sign-in/main route.
3. Expected:
   - app requires `Org Connect` first.

### B) Connect + Login (ORG001)

1. Run `Org Connect` with `ORG001` and valid registry contact.
2. Login with ORG001 chair or member account.
3. Record baseline:
   - member count
   - user count
4. Expected:
   - login success
   - connected org badge/context = `ORG001`.

### C) Wrong Org Protection

1. While bound to `ORG001`, try login credentials from `ORG002`.
2. Expected:
   - blocked/fail
   - no cross-org session created.

### D) OS-Level Clear / Cache Clean

1. Perform platform-local clear action:
   - APK: app storage/data clear
   - EXE: local app/browser storage clear
   - Web: site data/local storage clear
2. Reopen app.
3. Expected:
   - app returns to `Org Connect` flow
   - cannot proceed with member login before connect.

### E) Reconnect Recover

1. Reconnect `ORG001`.
2. Login with valid ORG001 account.
3. Run sync pull as needed.
4. Verify restored counts match baseline or expected authoritative values.
5. Expected:
   - data restored
   - no silent data wipe.

### F) Isolation Check

1. Sign out and reconnect/login `ORG002`.
2. Confirm ORG002 dataset remains ORG002-only.
3. Reconnect/login ORG001 again.
4. Expected:
   - each org shows only its own data.

### G) Admin Route

1. Login via admin flow.
2. Open `/system`.
3. Expected:
   - route reachable
   - no forced org-user redirect loop.

## 5) Evidence to Collect

1. Screenshot:
   - Org Connect required screen after clear
   - successful reconnect screen
   - member count before/after recover
   - `/system` route for admin
2. API evidence:
   - `/api/sync/health` response JSON
3. Notes:
   - exact step where fail occurs
   - platform + version/app build used.

## 6) Result Template

```text
Reconnect Smoke Result (Date: YYYY-MM-DD)

Platform: APK / EXE / Web
Build/Version:
Org Under Test: ORG001, ORG002

A First-run Gate: PASS/FAIL
B Connect + Login: PASS/FAIL
C Wrong Org Protection: PASS/FAIL
D Clear/Cache -> Reconnect Required: PASS/FAIL
E Reconnect Recover: PASS/FAIL
F Org Isolation: PASS/FAIL
G Admin /system Reachable: PASS/FAIL

Baseline Counts (ORG001): members=<n>, users=<n>
Recovered Counts (ORG001): members=<n>, users=<n>
Health Commit: <commitHash from /api/sync/health>

Notes:
- 
```

## 7) Optional Automation (Lite)

Use this command to quickly check deploy commit + local org snapshot isolation baseline:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync/run-org-reconnect-smoke-lite.ps1 -RenderBaseUrl https://social-org-manager.onrender.com -ExpectedRef HEAD -OrgA ORG001 -OrgB ORG002
```

Expected:

- exit code `0` when key checks pass
- JSON output includes:
  - `renderCommitMatch: true`
  - `orgAScopeMatch: true`
  - `orgBScopeMatch: true`
