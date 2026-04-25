import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

function getBaseDir(): string {
  const envBase = String(process.env.ORGHUB_BASE_DIR || "").trim();
  if (envBase) return path.resolve(envBase);
  return process.cwd();
}

function resolveFromBase(...parts: string[]): string {
  return path.resolve(getBaseDir(), ...parts);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  const allowedExactOrigins = new Set<string>();

  const pushAllowedOrigin = (raw: string) => {
    const value = String(raw || "").trim();
    if (!value) return;
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        allowedExactOrigins.add(parsed.origin);
      }
    } catch {
      // ignore malformed origins from env
    }
  };

  pushAllowedOrigin(String(process.env.REPLIT_DEV_DOMAIN || ""));
  String(process.env.REPLIT_DOMAINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach(pushAllowedOrigin);

  const isAllowedLocalOrigin = (origin: string): boolean => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;
    const octets = match.slice(1).map((part) => Number(part));
    if (octets.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) return false;
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  };

  app.use((req, res, next) => {
    const origin = String(req.header("origin") || "").trim();
    const allowed =
      !!origin && (allowedExactOrigins.has(origin) || isAllowedLocalOrigin(origin));

    if (allowed) {
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(allowed ? 204 : 403);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    "/api",
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use("/api", express.urlencoded({ extended: false, limit: "20mb" }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function setupRateLimiting(app: express.Application) {
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.ORGHUB_RATE_LIMIT_MAX || 240),
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(globalLimiter);

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.ORGHUB_API_RATE_LIMIT_MAX || 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, reason: "rate_limited" },
  });
  app.use("/api", apiLimiter);
}

function getAppName(): string {
  try {
    const appJsonPath = resolveFromBase("app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = resolveFromBase("static-build", platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeVariant(raw?: string | null): "unified" | "org-client" | "central-admin" {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (value === "org-client" || value === "client" || value === "org") return "org-client";
  if (value === "central-admin" || value === "admin" || value === "central") return "central-admin";
  return "unified";
}

function readJsonConfigFromBase(...parts: string[]): unknown | null {
  try {
    const fullPath = resolveFromBase(...parts);
    if (!fs.existsSync(fullPath)) return null;
    return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  } catch {
    return null;
  }
}

function buildBootLoaderHtml(targetPath: string): string {
  const safeTarget = escapeHtml(targetPath || "/");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Social Org Manager</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        font-family: "Segoe UI", Tahoma, sans-serif;
        background: radial-gradient(circle at 25% 15%, #dff7f0 0%, #eef8ff 45%, #f6fbff 100%);
        min-height: 100vh;
        display: grid;
        place-items: center;
        color: #0f172a;
      }
      .card {
        width: min(92vw, 520px);
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid #d8e6f5;
        border-radius: 22px;
        padding: 28px 24px;
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
      }
      .title { margin: 0 0 8px; font-size: 1.45rem; font-weight: 700; color: #0f766e; }
      .subtitle { margin: 0 0 18px; font-size: 0.95rem; color: #475569; }
      .cycle {
        width: 86px;
        height: 86px;
        margin: 8px auto 18px;
        border-radius: 999px;
        border: 6px solid #cfe9e4;
        border-top-color: #0f766e;
        border-right-color: #14b8a6;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .progress-wrap {
        width: 100%;
        height: 10px;
        border-radius: 999px;
        background: #e2ecf6;
        overflow: hidden;
        margin-bottom: 12px;
      }
      .progress {
        width: 18%;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #0f766e, #22c55e);
        transition: width 260ms ease;
      }
      .status {
        margin: 0;
        min-height: 24px;
        font-size: 0.95rem;
        color: #334155;
      }
      .meta {
        margin-top: 14px;
        font-size: 0.8rem;
        color: #64748b;
        line-height: 1.45;
      }
      .retry {
        margin-top: 14px;
        padding: 10px 14px;
        border: 1px solid #0f766e;
        background: #fff;
        color: #0f766e;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
        display: none;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1 class="title">Social Org Manager</h1>
      <p class="subtitle">Server ကို နှိုးနေပါသည်။ ကျေးဇူးပြု၍ ခဏစောင့်ပါ။</p>
      <div class="cycle" aria-hidden="true"></div>
      <div class="progress-wrap"><div id="progress" class="progress"></div></div>
      <p id="status" class="status">Initializing service...</p>
      <button id="retry" class="retry" type="button">Retry Now</button>
      <div class="meta">Target: <span id="target">${safeTarget}</span></div>
    </main>
    <script>
      (function () {
        const targetRaw = document.getElementById("target")?.textContent || "/";
        const statusEl = document.getElementById("status");
        const progressEl = document.getElementById("progress");
        const retryBtn = document.getElementById("retry");
        const steps = [
          "Starting server...",
          "Connecting to sync API...",
          "Preparing app shell...",
          "Almost ready..."
        ];
        let progress = 12;
        let stepIdx = 0;
        let done = false;
        let lastError = "";

        function setStatus(text) {
          if (statusEl) statusEl.textContent = text;
        }
        function setProgress(value) {
          progress = Math.max(8, Math.min(96, value));
          if (progressEl) progressEl.style.width = progress + "%";
        }
        function buildReadyTarget() {
          const url = new URL(targetRaw, window.location.origin);
          url.searchParams.set("__bootReady", "1");
          return url.pathname + url.search + url.hash;
        }
        async function checkReady() {
          if (done) return;
          try {
            const res = await fetch("/api/sync/health?warmup=1", { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            done = true;
            setProgress(100);
            setStatus("Ready. Opening app...");
            window.location.replace(buildReadyTarget());
          } catch (err) {
            lastError = String((err && err.message) || err || "Server is still waking up");
          }
        }

        const pulseTimer = setInterval(() => {
          if (done) return clearInterval(pulseTimer);
          stepIdx = (stepIdx + 1) % steps.length;
          setStatus(steps[stepIdx]);
          setProgress(progress + 7);
        }, 900);

        const pingTimer = setInterval(checkReady, 1500);
        checkReady();

        setTimeout(() => {
          if (done) return;
          if (retryBtn) {
            retryBtn.style.display = "inline-block";
            retryBtn.addEventListener("click", function () {
              setStatus("Retrying...");
              setProgress(25);
              checkReady();
            });
          }
          if (lastError) {
            setStatus("Still waking up... " + lastError);
          }
        }, 25000);
      })();
    </script>
  </body>
</html>`;
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = resolveFromBase("server", "templates", "landing-page.html");
  let landingPageTemplate = "";
  if (fs.existsSync(templatePath)) {
    landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  } else {
    landingPageTemplate = "<html><body><h3>OrgHub</h3><p>Landing page template not found.</p></body></html>";
  }
  const appName = getAppName();

  const webBuildDir = resolveFromBase("web-build");
  const hasWebBuild =
    fs.existsSync(webBuildDir) &&
    fs.existsSync(path.join(webBuildDir, "index.html"));
  const webIndexPath = path.join(webBuildDir, "index.html");
  let cachedWebIndexHtml: string | null = null;
  let cachedWebIndexMtimeMs = 0;

  const buildInjectedWebIndex = (html: string): string => {
    const appVariant = normalizeVariant(
      String(process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || "unified"),
    );
    const managedOrgConfigsRaw = String(
      process.env.EXPO_PUBLIC_MANAGED_ORG_CONFIGS || "",
    ).trim();
    let managedOrgConfigsPayload = JSON.stringify(managedOrgConfigsRaw);
    if (managedOrgConfigsRaw) {
      try {
        managedOrgConfigsPayload = JSON.stringify(
          JSON.parse(managedOrgConfigsRaw),
        );
      } catch {
        // keep string payload if not valid JSON
      }
    }

    const firebaseConfigRaw = String(process.env.EXPO_PUBLIC_FIREBASE_CONFIG_JSON || "").trim();
    let firebaseConfigPayload = "null";
    if (firebaseConfigRaw) {
      try {
        firebaseConfigPayload = JSON.stringify(JSON.parse(firebaseConfigRaw));
      } catch {
        firebaseConfigPayload = JSON.stringify(firebaseConfigRaw);
      }
    } else {
      const apiKey = String(process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "").trim();
      const authDomain = String(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "").trim();
      const projectId = String(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
      const storageBucket = String(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
      const messagingSenderId = String(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "").trim();
      const appId = String(process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "").trim();
      const measurementId = String(process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "").trim();
      if (apiKey && projectId && appId) {
        firebaseConfigPayload = JSON.stringify({
          apiKey,
          authDomain: authDomain || undefined,
          projectId,
          storageBucket: storageBucket || undefined,
          messagingSenderId: messagingSenderId || undefined,
          appId,
          measurementId: measurementId || undefined,
        });
      }
    }

    if (firebaseConfigPayload === "null") {
      const fileConfig = readJsonConfigFromBase("server", "config", "firebase-web-config.json");
      if (fileConfig) {
        firebaseConfigPayload = JSON.stringify(fileConfig);
      }
    }

    const injection = `<script>window.__APP_CONFIG__=window.__APP_CONFIG__||{};window.__APP_CONFIG__.appVariant=${JSON.stringify(appVariant)};window.__APP_CONFIG__.managedOrgConfigs=${managedOrgConfigsPayload};window.__APP_CONFIG__.firebaseConfig=${firebaseConfigPayload};</script>`;
    return html.replace("</head>", `${injection}</head>`);
  };

  const loadInjectedWebIndexHtml = (): string | null => {
    if (!hasWebBuild) return null;
    try {
      const stat = fs.statSync(webIndexPath);
      const mtimeMs = Number(stat?.mtimeMs || 0);
      if (cachedWebIndexHtml && cachedWebIndexMtimeMs === mtimeMs) {
        return cachedWebIndexHtml;
      }
      const raw = fs.readFileSync(webIndexPath, "utf-8");
      const injected = buildInjectedWebIndex(raw);
      cachedWebIndexHtml = injected;
      cachedWebIndexMtimeMs = mtimeMs;
      return injected;
    } catch {
      return null;
    }
  };

  const sendWebIndex = (res: Response) => {
    const cached = loadInjectedWebIndexHtml();
    if (cached) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(cached);
    }
    return res.sendFile(webIndexPath);
  };

  const shouldServeBootLoader = (req: Request): boolean => {
    if (!hasWebBuild) return false;
    const accept = String(req.header("accept") || "");
    if (!accept.includes("text/html")) return false;
    if (req.path.startsWith("/api")) return false;
    if (req.path.startsWith("/_expo") || req.path.startsWith("/assets") || req.path === "/favicon.ico") return false;
    const alreadyReady = String(req.query?.__bootReady || "").trim() === "1";
    if (alreadyReady) return false;
    const host = String(req.header("x-forwarded-host") || req.get("host") || "").toLowerCase();
    const forceEnabled = String(process.env.ORGHUB_BOOT_LOADER_ENABLED || "").trim() === "1";
    const renderHost = host.includes(".onrender.com") || host.includes(".render.com");
    return forceEnabled || renderHost;
  };

  const sendBootLoader = (req: Request, res: Response) => {
    const rawTarget = String(req.originalUrl || req.url || "/").trim() || "/";
    let target = rawTarget;
    try {
      const parsed = new URL(rawTarget, "https://placeholder.local");
      parsed.searchParams.delete("__bootReady");
      const nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      target = nextPath || "/";
    } catch {
      target = "/";
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(buildBootLoaderHtml(target));
  };

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      if (hasWebBuild) {
        if (shouldServeBootLoader(req)) {
          return sendBootLoader(req, res);
        }
        return sendWebIndex(res);
      }
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use(
    "/assets",
    express.static(resolveFromBase("assets"), {
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store");
      },
    })
  );
  app.use(express.static(resolveFromBase("static-build")));

  if (hasWebBuild) {
    const webExpoAssetsDir = path.join(webBuildDir, "_expo");
    if (fs.existsSync(webExpoAssetsDir)) {
      app.use(
        "/_expo",
        express.static(webExpoAssetsDir, {
          setHeaders: (res) => {
            res.setHeader("Cache-Control", "no-store");
          },
        })
      );
    }
    const webAssetsDir = path.join(webBuildDir, "assets");
    if (fs.existsSync(webAssetsDir)) {
      app.use(
        "/assets",
        express.static(webAssetsDir, {
          setHeaders: (res) => {
            res.setHeader("Cache-Control", "no-store");
          },
        })
      );
    }
    const webFavicon = path.join(webBuildDir, "favicon.ico");
    if (fs.existsSync(webFavicon)) {
      app.get("/favicon.ico", (_req, res) => res.sendFile(webFavicon));
    }
    app.use("/web", express.static(webBuildDir));
    app.get(/^\/web(\/.*)?$/, (_req, res) => {
      return sendWebIndex(res);
    });
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/manifest") return next();
      if (req.path.startsWith("/_expo") || req.path.startsWith("/assets") || req.path === "/favicon.ico") {
        return next();
      }
      const accept = String(req.header("accept") || "");
      if (!accept.includes("text/html")) return next();
      if (shouldServeBootLoader(req)) {
        return sendBootLoader(req, res);
      }
      return sendWebIndex(res);
    });
    log("Web build route enabled at /web");
  }

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  const bootStartedAt = Date.now();
  setupCors(app);
  setupRateLimiting(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  const server = await registerRoutes(app);
  configureExpoAndLanding(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  const listenOptions: any = {
    port,
    host: "0.0.0.0",
  };
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }
  server.listen(listenOptions, () => {
    log(`express server serving on port ${port} (boot ${Date.now() - bootStartedAt}ms)`);
  });
})();
