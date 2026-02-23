# Social Org Manager (OrgHub)

Social Org Manager is an offline-first organization management app for mobile and web.
It supports member management, finance/loan records, events, messaging, backup/restore, and LAN/Cloud sync.

## Maintainer

- Project Owner: MR. SOE MYINT SWE

## Key Features

- Member management with profile and family information
- Income/expense, loan, and payment-request workflows
- Events, reactions, comments, messaging
- Role-based permissions and approval flows
- LAN Sync + Google Apps Script Cloud Sync
- App update check and in-app APK update flow
- Backup and restore (JSON)

## Tech Stack

- React Native + Expo (TypeScript)
- Expo Router
- AsyncStorage
- Express (LAN sync/API)

## Repository Security & Data Policy

This repository is intended to stay as a **clean source-code repository**.

- Do not commit real member data, backups, screenshots with personal data, or local databases.
- `assets/data/default-data.json` now contains sanitized template data only.
- Runtime data should stay on device/server runtime storage or private backup locations.
- API keys/secrets must be stored in environment or private settings, not hardcoded in Git.

## Quick Start

```bash
npm install
npm start
```

Useful commands:

```bash
npm run server:lan
npm run lint
```

Android release build:

```bash
cd android
.\gradlew.bat assembleRelease
```

## Cloud Sync (Google Apps Script)

- Setup guide: `docs/google-drive-cloud-sync-mvp.md`
- Script template: `docs/google-drive-cloud-sync-webapp.gs`

## Security Reporting

If you find a security issue, please follow `SECURITY.md`.

## License

This project is licensed under the MIT License. See `LICENSE`.
