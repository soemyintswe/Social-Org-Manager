# Google Drive Cloud Sync (MVP)

This app now supports cloud sync via a Google Apps Script Web App.

## What this gives you

- Phone-to-phone sync without running `npm run server:lan`.
- Shared snapshot stored in Google Drive as `orghub_sync_snapshot.json`.
- You can switch Google accounts later by redeploying the script under another account and updating the Script URL in app settings.

## Steps you must do once

1. Open `script.google.com` with the Google account you want to use.
2. Create a new Apps Script project.
3. Paste the script from `docs/google-drive-cloud-sync-webapp.gs`.
4. In script, set `API_KEY` (optional but recommended).
5. Deploy:
   - `Deploy` -> `New deployment` -> `Web app`
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Copy the Web App URL.
7. In app:
   - `Account Settings`
   - Fill `Cloud Script URL`
   - Fill the same `Cloud API Key` (if used)
   - Turn on `Cloud Sync Enabled`
   - Tap `Save`
8. On both phones, use the same Cloud URL + API key and tap `Sync Now`.

## Notes

- `LAN Sync` and `Cloud Sync` can run together.
- If both are enabled, app tries both targets.
- Cloud payload is full snapshot JSON and merge-applied on pull.
- Large image data is compressed before push (non-web mobile).
