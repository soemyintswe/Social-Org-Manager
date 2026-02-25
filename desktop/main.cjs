const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const net = require("net");
const fs = require("fs");

app.setName("Social Org Manager");
app.setAppUserModelId("com.soemyintswe.orghub.desktop");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.disableHardwareAcceleration();
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let serverBootstrapped = false;
let activePort = 5000;

function getDesktopLogFile() {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "desktop.log");
  } catch {
    return null;
  }
}

function logDesktop(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    const file = getDesktopLogFile();
    if (file) fs.appendFileSync(file, line, "utf8");
  } catch {
    // no-op
  }
}

async function checkServerHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/sync/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function canListenOnPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "127.0.0.1");
  });
}

async function resolvePreferredPort() {
  const preferred = Number(process.env.PORT || 5000);
  const preferredHealthy = await checkServerHealth(`http://127.0.0.1:${preferred}`);
  if (preferredHealthy) return preferred;

  const preferredFree = await canListenOnPort(preferred);
  if (preferredFree) return preferred;

  for (let p = 5001; p <= 5020; p += 1) {
    const free = await canListenOnPort(p);
    if (free) return p;
  }
  return preferred;
}

async function startEmbeddedServer(baseUrl) {
  if (serverBootstrapped) return;
  const alreadyRunning = await checkServerHealth(baseUrl);
  if (alreadyRunning) {
    serverBootstrapped = true;
    return;
  }

  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  process.env.PORT = String(activePort);
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
  const port = await resolvePreferredPort();
  activePort = port;
  const baseUrl = `http://127.0.0.1:${port}`;
  logDesktop(`createWindow start with baseUrl=${baseUrl}`);

  await startEmbeddedServer(baseUrl);
  const ready = await waitForServerReady(baseUrl, 20000);
  if (!ready) {
    logDesktop("server not ready within timeout");
    dialog.showErrorBox("Server Error", "Local server could not start. Please restart the app.");
    return;
  }
  if (port !== 5000) {
    dialog.showErrorBox("Info", `Port 5000 already in use. Desktop app started on port ${port}.`);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    center: true,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });
  let shown = false;

  try {
    await mainWindow.webContents.session.clearCache();
  } catch {
    // ignore cache clear failures
  }

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    logDesktop("ready-to-show");
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    shown = true;
  });

  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || shown) return;
    logDesktop("ready-to-show timeout reached; force showing window");
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    shown = true;
  }, 3500);

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logDesktop(`render-process-gone reason=${details?.reason || "unknown"} exitCode=${details?.exitCode}`);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logDesktop(`renderer console level=${level} ${sourceId}:${line} ${message}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    logDesktop("did-finish-load");
    setTimeout(async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      try {
        const uiInfo = await mainWindow.webContents.executeJavaScript(
          `(() => {
            const root = document.getElementById('root');
            const info = {
              href: String(location.href || ""),
              title: String(document.title || ""),
              rootChildren: root ? root.children.length : -1,
              rootNodes: root ? root.querySelectorAll('*').length : -1,
              rootHtmlLength: root ? String(root.innerHTML || '').length : 0,
              textLength: root ? String(root.innerText || '').trim().length : 0,
              bodyBg: String(getComputedStyle(document.body).backgroundColor || ''),
            };
            return info;
          })();`,
          true
        );
        logDesktop(`ui snapshot ${JSON.stringify(uiInfo)}`);

        if (Number(uiInfo.rootChildren) <= 0) {
          logDesktop("blank root detected (children<=0), reloadIgnoringCache");
          mainWindow.webContents.reloadIgnoringCache();
        }

        const looksBlank =
          Number(uiInfo.rootChildren) <= 0 ||
          Number(uiInfo.rootNodes) <= 1 ||
          (Number(uiInfo.rootHtmlLength) < 40 && Number(uiInfo.textLength) === 0);

        if (looksBlank) {
          logDesktop("renderer appears blank; opening browser fallback");
          const webUrl = `${baseUrl}/web/`;
          try {
            await shell.openExternal(webUrl);
          } catch (err) {
            logDesktop(`openExternal failed: ${String(err?.message || err)}`);
          }

          const fallbackHtml = `
            <!doctype html>
            <html lang="en">
              <head><meta charset="utf-8"><title>Social Org Manager</title></head>
              <body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fb;color:#0f172a">
                <h2 style="margin-top:0">Social Org Manager</h2>
                <p>Desktop renderer blank screen ဖြစ်နေတာကြောင့် browser mode နဲ့ဖွင့်ပေးထားပါတယ်။</p>
                <p><a href="${webUrl}" style="font-size:16px">Open App In Browser</a></p>
              </body>
            </html>`;
          await mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(fallbackHtml)}`);
        }
      } catch (e) {
        logDesktop(`root check failed ${String(e?.message || e)}`);
      }
    }, 1800);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logDesktop(`did-fail-load code=${errorCode} reason=${errorDescription} url=${validatedURL}`);
    dialog.showErrorBox(
      "Window Load Error",
      `Failed to load desktop UI.\nCode: ${errorCode}\nReason: ${errorDescription}\nURL: ${validatedURL}`
    );
  });

  try {
    const target = `${baseUrl}/web/?t=${Date.now()}`;
    logDesktop(`loadURL ${target}`);
    await mainWindow.loadURL(target);
  } catch {
    const fallback = `${baseUrl}/?t=${Date.now()}`;
    logDesktop(`loadURL fallback ${fallback}`);
    await mainWindow.loadURL(fallback);
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

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
