# PROJECT_SELF_AUDIT

_Last updated: 2026-04-26 (Asia/Rangoon)_

## 1) Completed / Implemented

- System Admin architecture remains separated from org data storage via system-scoped keys (`@sysdb:*`).
- Org-scoped storage remains active (`@orgdb:<ORGID>:`), with strict ORG isolation preserved in current flows.
- Restore/import reliability was hardened:
  - selected file content is used directly
  - large JSON restore is no longer limited by preview text behavior
  - restored local state is no longer immediately overwritten by stale remote pull
- ORG001 recovery path was successfully unblocked, including financial records.
- Chairperson can access org-scoped backup/restore without needing system-admin login.
- Variant split is now functional in practice:
  - `org-client`
  - `central-admin`
- `org-client` hides `System Admin Login` and blocks `/system`.
- `central-admin` keeps central registry/admin flow reachable.
- Android split is functional with separate app identity/package behavior for the two variants.
- Desktop split is functional:
  - org-client opens `Org Connect` first
  - central-admin opens admin login first
- Desktop admin password now follows authoritative current data instead of stale local state.
- Desktop login screens now expose visible `Show / Hide` password controls.
- Org Connect validation accepts a matching email OR matching phone when both are entered.
- App close/reopen now returns to login instead of silently restoring the last signed-in session.
- Central Admin Org Registry mobile usability was improved:
  - list supports horizontal scroll
  - edit form supports horizontal scroll
  - long field values are visible/editable
- Release automation now supports current APK/EXE publication flow through GitHub releases.
- Current public release line is `1.1.73`.
- Latest verified deployed commit before this doc refresh:
  - `18b45bae78485455e2c978f63010af637d400516`

## 2) In Progress / Watch Items

- Full automated regression suite is still missing.
- Web split strategy is not finalized yet.
- Release evidence/docs could still benefit from final screenshot-based QA records.
- Desktop clean-machine QA is still worth repeating if a high-confidence handoff is needed.

## 3) Restore Point Policy

- Use `docs/restore-points.md` as the source of truth for tagged rollback landmarks.
- The most important release-aligned restore point remains:
  - `restore-point-2026-04-24-pre-variant-split` -> `28d9e0b`
- Variant groundwork restore points remain useful if future split work needs partial rollback.

## Recommended Next Sequence

1. Keep using per-org backups before any major data operation.
2. For restore/import, prefer `Import (Merge)` first unless a full replacement is truly intended.
3. Before any new deploy, verify `/api/sync/health` matches the target commit.
4. If web split is pursued next, preserve the current working desktop/mobile split behavior.
