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
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "20mb" }));
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

function configureExpoAndLanding(app: express.Application) {
  const templatePath = resolveFromBase("server", "templates", "landing-page.html");
  let landingPageTemplate = "";
  if (fs.existsSync(templatePath)) {
    landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  } else {
    landingPageTemplate = "<html><body><h3>OrgHub</h3><p>Landing page template not found.</p></body></html>";
  }
  const appName = getAppName();

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
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(resolveFromBase("assets")));
  app.use(express.static(resolveFromBase("static-build")));

  const webBuildDir = resolveFromBase("web-build");
  const hasWebBuild =
    fs.existsSync(webBuildDir) &&
    fs.existsSync(path.join(webBuildDir, "index.html"));
  if (hasWebBuild) {
    const webExpoAssetsDir = path.join(webBuildDir, "_expo");
    if (fs.existsSync(webExpoAssetsDir)) {
      app.use("/_expo", express.static(webExpoAssetsDir));
    }
    const webFavicon = path.join(webBuildDir, "favicon.ico");
    if (fs.existsSync(webFavicon)) {
      app.get("/favicon.ico", (_req, res) => res.sendFile(webFavicon));
    }
    app.use("/web", express.static(webBuildDir));
    app.get(/^\/web(\/.*)?$/, (_req, res) => {
      return res.sendFile(path.join(webBuildDir, "index.html"));
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
  setupCors(app);
  setupRateLimiting(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

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
    log(`express server serving on port ${port}`);
  });
})();
