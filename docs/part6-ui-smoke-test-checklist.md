# Part 6 UI Smoke Test Checklist

Last updated: 2026-04-21
Branch target: `deploy-fix`
Goal: verify 3 critical fixes end-to-end by manual runtime test.

## 1) Test Preparation

1. Start backend:
```powershell
npm run server:build
node server_dist/index.cjs
```
2. Open app on web (or device build):
```text
http://localhost:5000
```
3. Keep a test note file and record each step as `PASS` or `FAIL`.

## 2) Scenario A: Admin Password Persistence

Expected: admin password change is permanent and last password is always valid.

1. Go to `/admin-sign-in`.
2. Login with current admin password.
3. Open `Account Settings`.
4. Change password:
   `Current Password -> New Password = Admin#A1 -> Confirm`.
5. App should sign out and move to `/admin-sign-in`.
6. Login try with old password:
   Expected: `FAIL` (must not login).
7. Login try with `Admin#A1`:
   Expected: `PASS`.
8. Repeat change again:
   `Admin#A1 -> Admin#A2`.
9. Sign in checks:
   Old `Admin#A1` fails, new `Admin#A2` passes.
10. Repeat one more time:
   `Admin#A2 -> Admin#A3`.
11. Close browser/app completely and reopen.
12. Login with `Admin#A3`:
   Expected: `PASS`.
13. (Optional restore) Change back to your preferred production password.

Pass criteria:
`Latest password works after restart, previous passwords do not work.`

## 3) Scenario B: Org Connect Unexpected Logout

Expected: after org connect + login, session stays alive (no quick forced logout).

1. Open `/org-connect`.
2. Fill:
   `Org ID = ORG001`
   `Org Email/Phone = valid registry value`
3. Tap `Verify & Continue`.
4. Ensure route goes to sign-in with org context.
5. Login with a valid ORG001 org user account.
6. Wait on dashboard for 3 minutes with light activity (click tabs).
7. Expected:
   Still logged in.
8. Hard refresh browser once (`Ctrl+R`).
9. Expected:
   Still logged in or at least not immediately kicked by auto logout race.
10. Keep app idle for 6 minutes.
11. Expected:
   Still logged in (auto logout is no longer short timeout behavior).

Pass criteria:
`No immediate/short unexpected logout after org connect and login.`

## 4) Scenario C: ORG000 -> ORG001 Legacy Member Recovery

Expected: ORG001 shows historical member dataset (65 members), not truncated small set.

1. Connect/login as ORG001 user.
2. Open `Members` screen.
3. Count check:
   Expected member count = `65` (or your authoritative expected number).
4. Verify sample known member IDs/names from old dataset are present.
5. Open dashboard summary cards and verify member totals align.
6. Run sync manually from dashboard/system:
   `LAN Pull`, `LAN Push`, `Cloud Pull`, `Cloud Push` (as available).
7. Reopen `Members`.
8. Expected:
   Count remains stable, does not drop to tiny dataset (1 or near-empty).
9. Sign out.
10. Connect/login as `ORG002`.
11. Verify ORG002 members remain isolated (small org dataset as expected).
12. Reconnect/login ORG001 again.
13. Expected:
   ORG001 still has full historical set.

Pass criteria:
`ORG001 historical members persist and do not get overwritten by stale/smaller snapshots.`

## 5) Quick Failure Triage

If Scenario A fails:
1. Capture exact step and entered password sequence.
2. Note if failure happens before or after app restart.
3. Screenshot `/admin-sign-in` result.

If Scenario B fails:
1. Note exact minute of logout.
2. Note last route before logout.
3. Capture browser console log around logout time.

If Scenario C fails:
1. Record count before sync and after sync.
2. Record active org ID shown in settings.
3. Save `Members` screenshot and sync result messages.

## 6) Result Template

Use this exact template in chat:

```text
Part6 Smoke Result

Scenario A (Admin Password):
- A1 change: PASS/FAIL
- A2 change: PASS/FAIL
- A3 change + restart login: PASS/FAIL
- Notes:

Scenario B (Org Connect Logout):
- Connect flow: PASS/FAIL
- 3-min active session: PASS/FAIL
- Refresh stability: PASS/FAIL
- 6-min idle stability: PASS/FAIL
- Notes:

Scenario C (ORG001 Recovery):
- ORG001 member count at login: <number>
- After sync member count: <number>
- ORG002 isolation check: PASS/FAIL
- Re-login ORG001 stable: PASS/FAIL
- Notes:
```

