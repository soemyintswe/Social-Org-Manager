## npm audit Notes (Deferred)

This project currently has npm audit warnings that are primarily related to dev and desktop tooling. We are deferring major upgrades to avoid breaking the current codebase. No dependency changes were made at this time.

Date captured: 2026-03-24

### Summary
- 14 vulnerabilities: 9 low, 5 moderate
- Affected packages are in tooling chains: Electron, electron-builder, drizzle-kit/esbuild, and related transitive deps.

### Details (Deferred Fixes)
1. `electron` (moderate)
   - Advisory: GHSA-vmqv-hx8q-j7mg (ASAR Integrity Bypass)
   - Fix available: major upgrade to `electron@41.0.3`

2. `electron-builder` / `app-builder-lib` / `dmg-builder` / `@electron/rebuild` / `node-gyp` / `make-fetch-happen` / `http-proxy-agent` (low)
   - Fix available: major upgrade to `electron-builder@26.8.1`

3. `drizzle-kit` / `@esbuild-kit/esm-loader` / `@esbuild-kit/core-utils` / `esbuild` (moderate)
   - Fix available: major upgrade path suggested by audit (may require tooling changes)

### Decision
We will not run `npm audit fix --force` and will not perform major tooling upgrades at this time. These items should be revisited in a dedicated maintenance window.
