import type { Express } from "express";
import { createServer, type Server } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

type SyncSnapshot = {
  updatedAt: string;
  source?: string;
  data: Record<string, string>;
};

function getSnapshotFilePath(): string {
  return path.resolve(process.cwd(), "server", "data", "sync-snapshot.json");
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

  const httpServer = createServer(app);

  return httpServer;
}
