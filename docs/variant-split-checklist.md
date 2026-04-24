# Variant Split Checklist

_Last updated: 2026-04-24 (Asia/Rangoon)_

## Goal

Split the current unified app into:

- `org-client`
- `central-admin`

while keeping the existing production line stable until dedicated builds are validated.

## Already Completed

- restore point created before variant work:
  - `restore-point-2026-04-24-pre-variant-split`
- app variant runtime/build scaffolding added
- sign-in/admin routes gated by variant
- `org-client` hides admin entry and blocks `/system`
- desktop build identity/config now supports variant-specific product naming
- update metadata now supports variant-specific config files with fallback

## Still Pending Before Release

1. Local-only `org-client` APK build
2. Local-only `org-client` EXE build
3. Local-only `central-admin` EXE build
4. Manual QA:
   - org-client sign-in
   - org-client no admin entry
   - org-client cannot open `/system`
   - central-admin opens admin flow directly
   - update checks read the correct variant channel
5. Decide whether web should use:
   - separate subdomain
   - separate path
   - separate deploy target
6. Finalize release naming and GitHub asset naming policy
7. Only then push/deploy the split release line

## Safety Rules

- Do not overwrite the current production update channel until a dedicated variant build has been tested.
- Prefer restore-point tags over ad-hoc rollback steps.
- Keep `unified` behavior as the fallback until split rollout is approved.
