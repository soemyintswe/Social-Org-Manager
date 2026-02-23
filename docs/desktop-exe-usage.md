# Desktop EXE Usage (LAN + Cloud)

## Output

- Portable wrapper EXE: `desktop-dist/Social Org Manager 1.1.17.exe`
- Stable direct run EXE: `desktop-dist/win-unpacked/Social Org Manager.exe`

## What it does

- Starts local embedded server automatically (`http://127.0.0.1:5000`)
- Opens desktop app window at `/web`
- Supports both:
  - LAN sync (`http://<computer-ip>:5000`)
  - Cloud sync (Google Apps Script URL)

## Use on phones with this desktop app

1. Run the EXE on computer.
2. In phones, set LAN URL to computer IP port 5000.
3. Keep Cloud settings enabled on devices if you want off-computer continuity.

## If portable EXE cannot open

1. Open folder: `desktop-dist/win-unpacked`
2. Run: `Social Org Manager.exe`
3. If Windows SmartScreen appears:
   - Click `More info`
   - Click `Run anyway`

## Build again locally

```bash
npm run desktop:dist
```

## Important

- Desktop local sync snapshot is saved to Electron `userData/sync-data`.
- If computer is off:
  - LAN sync is unavailable.
  - Cloud sync still works on devices that have cloud endpoint configured.
