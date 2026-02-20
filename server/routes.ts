import type { Express } from "express";
import { createServer, type Server } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

type SyncSnapshot = {
  updatedAt: string;
  source?: string;
  data: Record<string, string>;
};

type AppUpdateConfig = {
  latestVersion: string;
  minimumVersion?: string;
  downloadUrl: string;
  notes?: string;
  force?: boolean;
  publishedAt?: string;
};

function getSnapshotFilePath(): string {
  return path.resolve(process.cwd(), "server", "data", "sync-snapshot.json");
}

function getAppUpdateConfigPath(): string {
  return path.resolve(process.cwd(), "server", "config", "app-update.json");
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

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api
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

  app.post("/api/sync/snapshot", (req, res) => {
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
      const hasUpdate = currentVersion
        ? compareVersion(config.latestVersion, currentVersion) > 0
        : true;
      const mustUpdate = !!(
        config.minimumVersion &&
        currentVersion &&
        compareVersion(config.minimumVersion, currentVersion) > 0
      );

      return res.json({
        ok: true,
        latestVersion: config.latestVersion,
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
