const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");

let mainWindow = null;

async function startEmbeddedServer() {
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  process.env.PORT = process.env.PORT || "5000";
  process.env.ORGHUB_BASE_DIR = app.getAppPath();
  process.env.ORGHUB_DATA_DIR = path.join(app.getPath("userData"), "sync-data");

  const serverEntry = path.join(app.getAppPath(), "server_dist", "index.cjs");
  require(serverEntry);
}

async function waitForServerReady(baseUrl, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/sync/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function createWindow() {
  const port = Number(process.env.PORT || 5000);
  const baseUrl = `http://127.0.0.1:${port}`;

  await startEmbeddedServer();
  const ready = await waitForServerReady(baseUrl, 20000);
  if (!ready) {
    dialog.showErrorBox("Server Error", "Local server could not start. Please restart the app.");
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await mainWindow.loadURL(`${baseUrl}/web`);
}

app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
