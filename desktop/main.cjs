const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const net = require("net");
const fs = require("fs");

function normalizeVariant(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (value === "org-client" || value === "client" || value === "org") return "org-client";
  if (value === "central-admin" || value === "admin" || value === "central") return "central-admin";
  return "unified";
}

function inferDesktopVariant() {
  const fromEnv = normalizeVariant(process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || "");
  if (fromEnv !== "unified") return fromEnv;
  try {
    const exeName = String(path.basename(process.execPath || "")).trim().toLowerCase();
    if (exeName.includes("central-admin") || exeName.includes("central admin")) return "central-admin";
    if (exeName.includes("social-org-manager") || exeName.includes("social org manager")) return "org-client";
  } catch {
    // ignore
  }
  try {
    const name = String(app.getName() || "").trim().toLowerCase();
    if (name.includes("central admin")) return "central-admin";
    if (name.includes("social org manager")) return "org-client";
  } catch {
    // ignore
  }
  return "unified";
}

function getDesktopAppIdentity() {
  const variant = inferDesktopVariant();
  if (variant === "central-admin") {
    return {
      variant,
      appName: "Org Registry Central Admin",
      appUserModelId: "com.soemyintswe.orghub.centraladmin.desktop",
    };
  }
  if (variant === "org-client") {
    return {
      variant,
      appName: "Social Org Manager",
      appUserModelId: "com.soemyintswe.orghub.desktop",
    };
  }
  return {
    variant,
    appName: "Social Org Manager",
    appUserModelId: "com.soemyintswe.orghub.desktop",
  };
}

function getDesktopInitialPath(baseUrl) {
  const params = new URLSearchParams();
  params.set("appVariant", desktopIdentity.variant);
  params.set("desktop", "1");
  params.set("t", String(Date.now()));
  if (desktopIdentity.variant === "central-admin") {
    return `${baseUrl}/admin-sign-in?${params.toString()}`;
  }
  if (desktopIdentity.variant === "org-client") {
    return `${baseUrl}/sign-in?${params.toString()}`;
  }
  return `${baseUrl}/web/?${params.toString()}`;
}

const desktopIdentity = getDesktopAppIdentity();
process.env.APP_VARIANT = desktopIdentity.variant;
process.env.EXPO_PUBLIC_APP_VARIANT = desktopIdentity.variant;
app.setName(desktopIdentity.appName);
app.setAppUserModelId(desktopIdentity.appUserModelId);
try {
  app.setPath("userData", path.join(app.getPath("appData"), desktopIdentity.appName));
} catch {
  // ignore
}
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
let blankCheckAttempts = 0;
let fallbackShown = false;
const DESKTOP_UPDATE_SKIP_FILE = "desktop-update-skip.json";

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

function parseVersion(version) {
  return String(version || "")
    .split(".")
    .map((part) => Number(String(part).replace(/[^\d]/g, "")))
    .filter((n) => Number.isFinite(n));
}

function compareVersion(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function getDesktopUpdateSkipFilePath() {
  try {
    return path.join(app.getPath("userData"), DESKTOP_UPDATE_SKIP_FILE);
  } catch {
    return "";
  }
}

function readDesktopUpdateSkipToken() {
  try {
    const file = getDesktopUpdateSkipFilePath();
    if (!file || !fs.existsSync(file)) return "";
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return String(parsed?.token || "").trim();
  } catch {
    return "";
  }
}

function writeDesktopUpdateSkipToken(token) {
  try {
    const file = getDesktopUpdateSkipFilePath();
    if (!file) return;
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          token: String(token || ""),
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // ignore
  }
}

function getDesktopUpdateToken(payload) {
  const version = String(payload?.latestVersion || "").trim();
  const build = String(payload?.latestBuildNumber || "").trim();
  const publishedAt = String(payload?.publishedAt || "").trim();
  return `${version}|${build}|${publishedAt}`;
}

async function checkDesktopUpdate(baseUrl) {
  try {
    const currentVersion = String(app.getVersion() || "0.0.0").trim();
    const url = `${baseUrl}/api/desktop-update?platform=desktop&variant=${encodeURIComponent(desktopIdentity.variant)}&version=${encodeURIComponent(currentVersion)}`;
    logDesktop(`desktop update check: ${url}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) {
      logDesktop(`desktop update check http_${res.status}`);
      return;
    }
    const payload = await res.json();
    const latestVersion = String(payload?.latestVersion || "").trim();
    const downloadUrl = String(payload?.downloadUrl || "").trim();
    const hasUpdateByPayload = Boolean(payload?.hasUpdate);
    const hasUpdateByVersion = latestVersion ? compareVersion(latestVersion, currentVersion) > 0 : false;
    const hasUpdate = hasUpdateByPayload || hasUpdateByVersion;
    if (!latestVersion || !downloadUrl || !hasUpdate) return;

    const forceUpdate = Boolean(payload?.force);
    const token = getDesktopUpdateToken(payload);
    const skipped = readDesktopUpdateSkipToken();
    if (!forceUpdate && token && skipped && token === skipped) {
      logDesktop(`desktop update skipped token matched: ${token}`);
      return;
    }

    const latestBuild = String(payload?.latestBuildNumber || "").trim();
    const notes = String(payload?.notes || "").trim();
    const lines = [
      `Current: ${currentVersion}`,
      `Latest: ${latestVersion}${latestBuild ? ` (${latestBuild})` : ""}`,
      "",
      notes || "Desktop update is available.",
    ];
    const buttons = forceUpdate
      ? ["Download Update", "Later"]
      : ["Download Update", "Skip This Version", "Later"];
    const defaultId = 0;
    const cancelId = forceUpdate ? 1 : 2;
    const result = await dialog.showMessageBox({
      type: "info",
      title: "Desktop Update Available",
      message: "New desktop version is available.",
      detail: lines.join("\n"),
      buttons,
      defaultId,
      cancelId,
      noLink: true,
    });

    if (result.response === 0) {
      await shell.openExternal(downloadUrl);
      return;
    }
    if (!forceUpdate && result.response === 1) {
      writeDesktopUpdateSkipToken(token);
    }
  } catch (error) {
    logDesktop(`desktop update check failed: ${String(error?.message || error)}`);
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
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    center: true,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    useContentSize: true,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });
  let shown = false;
  const baseUrlPattern = "http://127.0.0.1:*/*";

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

  const session = mainWindow.webContents.session;
  session.webRequest.onCompleted({ urls: [baseUrlPattern] }, (details) => {
    if (details.statusCode >= 400) {
      logDesktop(`resource ${details.statusCode} ${details.method} ${details.url} (${details.resourceType})`);
    }
  });
  session.webRequest.onErrorOccurred({ urls: [baseUrlPattern] }, (details) => {
    logDesktop(`resource error ${details.error} ${details.method} ${details.url} (${details.resourceType})`);
  });

  const loadStartedAt = Date.now();
  const fallbackAfterMs = 45000;

  const evaluateBlankScreen = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (fallbackShown) return;
    if (Date.now() - loadStartedAt < 6000) {
      setTimeout(evaluateBlankScreen, 6000);
      return;
    }
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

      const looksBlank =
        Number(uiInfo.rootChildren) <= 0 ||
        Number(uiInfo.rootNodes) <= 1 ||
        (Number(uiInfo.rootHtmlLength) < 40 && Number(uiInfo.textLength) === 0);

      if (!looksBlank) {
        blankCheckAttempts = 0;
        return;
      }

      blankCheckAttempts += 1;
      logDesktop(`renderer appears blank (attempt ${blankCheckAttempts})`);

      if (Date.now() - loadStartedAt < fallbackAfterMs) {
        setTimeout(evaluateBlankScreen, 6000);
        return;
      }

      const webUrl = getDesktopInitialPath(baseUrl);
      const fallbackHtml = `
        <!doctype html>
      <html lang="en">
          <head><meta charset="utf-8"><title>${desktopIdentity.appName}</title></head>
        <body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fb;color:#0f172a">
            <h2 style="margin-top:0">${desktopIdentity.appName}</h2>
            <p>Desktop UI ကိုဖွင့်မရသေးပါ။ အောက်က လင့်ခ်ကနေ browser mode နဲ့ဖွင့်နိုင်ပါတယ်။</p>
            <p><a href="${webUrl}" style="font-size:16px">Open App In Browser</a></p>
            <p><button id="retry" style="margin-top:8px;padding:8px 12px;border-radius:6px;border:1px solid #cbd5f5;background:#fff;cursor:pointer">Retry Desktop UI</button></p>
            <script>
              document.getElementById('retry')?.addEventListener('click', () => {
                location.href = '${baseUrl}/${desktopIdentity.variant === "central-admin" ? "admin-sign-in" : desktopIdentity.variant === "org-client" ? "sign-in" : "web/"}?appVariant=${desktopIdentity.variant}&desktop=1&t=' + Date.now();
              });
            </script>
          </body>
        </html>`;
      fallbackShown = true;
      await mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(fallbackHtml)}`);
    } catch (e) {
      logDesktop(`root check failed ${String(e?.message || e)}`);
    }
  };

  mainWindow.webContents.on("did-finish-load", () => {
    logDesktop("did-finish-load");
    setTimeout(evaluateBlankScreen, 6000);
    setTimeout(() => {
      void checkDesktopUpdate(baseUrl);
    }, 4500);
    mainWindow.webContents
      .executeJavaScript(
        `(() => {
          if (window.__orghubErrorHookInstalled) return;
          window.__orghubErrorHookInstalled = true;
          window.addEventListener('error', (e) => {
            console.error('window.onerror', e?.message || e);
          });
          window.addEventListener('unhandledrejection', (e) => {
            console.error('unhandledrejection', e?.reason || e);
          });
        })();`,
        true
      )
      .catch(() => {});
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logDesktop(`did-fail-load code=${errorCode} reason=${errorDescription} url=${validatedURL}`);
    const webUrl = getDesktopInitialPath(baseUrl);
    const fallbackHtml = `
      <!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><title>${desktopIdentity.appName}</title></head>
        <body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fb;color:#0f172a">
          <h2 style="margin-top:0">${desktopIdentity.appName}</h2>
          <p>Desktop UI ကိုဖွင့်မရပါ။</p>
          <pre style="white-space:pre-wrap;background:#fff;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">
Code: ${errorCode}
Reason: ${errorDescription}
URL: ${validatedURL}
          </pre>
          <p><a href="${webUrl}" style="font-size:16px">Open App In Browser</a></p>
        </body>
      </html>`;
    mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(fallbackHtml)}`);
  });

  try {
    const target = getDesktopInitialPath(baseUrl);
    logDesktop(`loadURL ${target}`);
    await mainWindow.loadURL(target);
  } catch {
    const fallback = `${baseUrl}/?appVariant=${desktopIdentity.variant}&desktop=1&t=${Date.now()}`;
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
