# Variant Split Checklist

_Last updated: 2026-04-26 (Asia/Rangoon)_

## Goal

Maintain the app as two practical distribution lines:

- `org-client`
- `central-admin`

while keeping release operations safe and recoverable.

## Completed

- restore point created before split work:
  - `restore-point-2026-04-24-pre-variant-split`
- app variant runtime/build scaffolding added
- route and admin-entry guards added
- variant-aware update metadata added
- desktop variant identity/config added
- mobile split APK behavior completed
- desktop split EXE behavior completed
- central-admin login/registry/edit usability fixes completed
- session relaunch now returns to login

## Current Verified Behavior

### Org Client

- admin entry is hidden
- `/system` is blocked
- first-run desktop flow goes through `Org Connect`
- mobile/desktop package identity is separate from central-admin

### Central Admin

- admin login opens directly on desktop
- central registry is reachable
- mobile list and edit form support horizontal scrolling
- mobile/desktop package identity is separate from org-client

## Still Pending / Nice To Finalize

1. Final web strategy:
   - keep unified web
   - separate path
   - separate subdomain/service
2. Final screenshot evidence for both variants
3. Optional new restore-point tags after the later desktop/mobile split fixes
4. Optional clean-machine QA for both EXEs

## Safety Rules

- Do not overwrite working release assets casually.
- Verify `/api/sync/health` after any production deploy.
- Prefer restore-point tags or known-good milestone commits over ad-hoc rollback decisions.
