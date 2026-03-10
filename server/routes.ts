import type { Express } from "express";
import { createServer, type Server } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import rateLimit from "express-rate-limit";

type SyncSnapshot = {
  updatedAt: string;
  source?: string;
  data: Record<string, string>;
};

type AppUpdateConfig = {
  latestVersion: string;
  latestBuildNumber?: string | number;
  minimumVersion?: string;
  downloadUrl: string;
  notes?: string;
  force?: boolean;
  publishedAt?: string;
};

function getBaseDir(): string {
  const envBase = String(process.env.ORGHUB_BASE_DIR || "").trim();
  if (envBase) return path.resolve(envBase);
  return process.cwd();
}

function resolveFromBase(...parts: string[]): string {
  return path.resolve(getBaseDir(), ...parts);
}

function getSnapshotFilePath(): string {
  const customDataDir = String(process.env.ORGHUB_DATA_DIR || "").trim();
  if (customDataDir) {
    return path.resolve(customDataDir, "sync-snapshot.json");
  }
  return resolveFromBase("server", "data", "sync-snapshot.json");
}

function getAppUpdateConfigPath(): string {
  return resolveFromBase("server", "config", "app-update.json");
}

function parseVersion(version: string): number[] {
  return String(version || "")
    .split(".")
    .map((part) => Number(String(part).replace(/[^\d]/g, "")))
    .filter((n) => Number.isFinite(n));
}

function compareVersion(left: string, right: string): number {
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

function parseBuildNumber(value: unknown): number | null {
  const n = Number(String(value ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function readSnapshot(): SyncSnapshot | null {
  try {
    const filePath = getSnapshotFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SyncSnapshot;
    if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: SyncSnapshot): void {
  const filePath = getSnapshotFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
}

function normalizeCloudProxyEndpoint(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  // Only accept exact Google Apps Script deployment URL format.
  const match = value.match(
    /^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec\/?$/i,
  );
  if (!match) return null;
  const deploymentId = match[1];
  // Build upstream URL from trusted constant host + validated deployment id.
  return `https://script.google.com/macros/s/${deploymentId}/exec`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api
  const snapshotWriteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.ORGHUB_SNAPSHOT_WRITE_RATE_LIMIT_MAX || 30),
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, reason: "rate_limited" },
  });
  const cloudProxyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.ORGHUB_CLOUD_PROXY_RATE_LIMIT_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, reason: "rate_limited" },
  });

  app.get("/api/sync/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.get("/api/sync/snapshot", (_req, res) => {
    const snapshot = readSnapshot();
    if (!snapshot) {
      return res.status(404).json({ message: "snapshot_not_found" });
    }
    return res.json(snapshot);
  });

  app.post("/api/sync/snapshot", snapshotWriteLimiter, (req, res) => {
    const body = (req.body || {}) as Partial<SyncSnapshot>;
    if (!body || typeof body !== "object" || !body.data || typeof body.data !== "object") {
      return res.status(400).json({ message: "invalid_payload" });
    }
    const snapshot: SyncSnapshot = {
      updatedAt: body.updatedAt || new Date().toISOString(),
      source: body.source || "unknown",
      data: body.data as Record<string, string>,
    };
    writeSnapshot(snapshot);
    return res.json({ ok: true, updatedAt: snapshot.updatedAt });
  });

  app.post("/api/cloud-sync/proxy", cloudProxyLimiter, async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const endpoint = String(body.endpoint || "").trim();
      if (!endpoint) {
        return res.status(400).json({ ok: false, reason: "missing_endpoint" });
      }
      const normalizedEndpoint = normalizeCloudProxyEndpoint(endpoint);
      if (!normalizedEndpoint) {
        return res.status(400).json({ ok: false, reason: "invalid_endpoint" });
      }

      const payload = { ...body };
      delete (payload as any).endpoint;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      let upstream: Response;
      try {
        upstream = await fetch(normalizedEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "follow",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const text = await upstream.text();
      const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
      res.status(upstream.status);
      res.setHeader("Content-Type", contentType);
      return res.send(text);
    } catch (error) {
      return res.status(502).json({
        ok: false,
        reason: "cloud_proxy_failed",
        detail: String((error as any)?.message || "unknown"),
      });
    }
  });

  app.get("/api/app-update", (req, res) => {
    try {
      const configPath = getAppUpdateConfigPath();
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ message: "update_config_not_found" });
      }
      const raw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw) as AppUpdateConfig;
      if (!config || !config.latestVersion || !config.downloadUrl) {
        return res.status(500).json({ message: "invalid_update_config" });
      }

      const currentVersion = String(req.query.version || "").trim();
      const currentBuildNumber = parseBuildNumber(req.query.build);
      const latestBuildNumber = parseBuildNumber(config.latestBuildNumber);

      const hasUpdateByVersion = currentVersion
        ? compareVersion(config.latestVersion, currentVersion) > 0
        : true;
      const hasUpdateByBuild =
        currentBuildNumber !== null && latestBuildNumber !== null
          ? latestBuildNumber > currentBuildNumber
          : false;
      const hasUpdate = hasUpdateByVersion || hasUpdateByBuild;
      const mustUpdate = !!(
        config.minimumVersion &&
        currentVersion &&
        compareVersion(config.minimumVersion, currentVersion) > 0
      );

      return res.json({
        ok: true,
        latestVersion: config.latestVersion,
        latestBuildNumber: config.latestBuildNumber ? String(config.latestBuildNumber) : "",
        minimumVersion: config.minimumVersion || "",
        downloadUrl: config.downloadUrl,
        notes: config.notes || "",
        force: Boolean(config.force || mustUpdate),
        hasUpdate,
        publishedAt: config.publishedAt || "",
      });
    } catch {
      return res.status(500).json({ message: "app_update_check_failed" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
