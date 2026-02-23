const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");

let mainWindow = null;
let serverBootstrapped = false;

async function checkServerHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/sync/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function startEmbeddedServer(baseUrl) {
  if (serverBootstrapped) return;
  const alreadyRunning = await checkServerHealth(baseUrl);
  if (alreadyRunning) {
    serverBootstrapped = true;
    return;
  }

  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  process.env.PORT = process.env.PORT || "5000";
  process.env.ORGHUB_BASE_DIR = app.getAppPath();
  process.env.ORGHUB_DATA_DIR = path.join(app.getPath("userData"), "sync-data");

  const serverEntry = path.join(app.getAppPath(), "server_dist", "index.cjs");
  try {
    require(serverEntry);
    serverBootstrapped = true;
  } catch (error) {
    dialog.showErrorBox("Server Error", `Local server bootstrap failed.\n${String(error?.message || error)}`);
    throw error;
  }
}

async function waitForServerReady(baseUrl, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await checkServerHealth(baseUrl);
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function createWindow() {
  const port = Number(process.env.PORT || 5000);
  const baseUrl = `http://127.0.0.1:${port}`;

  await startEmbeddedServer(baseUrl);
  const ready = await waitForServerReady(baseUrl, 20000);
  if (!ready) {
    dialog.showErrorBox("Server Error", "Local server could not start. Please restart the app.");
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    center: true,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    dialog.showErrorBox(
      "Window Load Error",
      `Failed to load desktop UI.\nCode: ${errorCode}\nReason: ${errorDescription}\nURL: ${validatedURL}`
    );
  });

  try {
    await mainWindow.loadURL(`${baseUrl}/web/`);
  } catch {
    await mainWindow.loadURL(`${baseUrl}/`);
  }
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
