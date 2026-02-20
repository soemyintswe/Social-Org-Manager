import Constants from "expo-constants";
import { getAccountSettings } from "@/lib/storage";

export type AppUpdateInfo = {
  ok: boolean;
  hasUpdate: boolean;
  latestVersion: string;
  minimumVersion?: string;
  downloadUrl: string;
  notes?: string;
  force?: boolean;
  publishedAt?: string;
  reason?: string;
};

function parseVersion(version: string): number[] {
  return String(version || "")
    .split(".")
    .map((part) => Number(String(part).replace(/[^\d]/g, "")))
    .filter((n) => Number.isFinite(n));
}

export function compareVersion(left: string, right: string): number {
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

export function getCurrentAppVersion(): string {
  return (
    String((Constants as any).nativeAppVersion || "") ||
    String((Constants as any).expoConfig?.version || "") ||
    "0.0.0"
  );
}

function normalizeUrl(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  return await Promise.race([
    fetch(url, { method: "GET" }),
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
  ]);
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  try {
    const settings = await getAccountSettings();
    const baseUrl = normalizeUrl(settings.syncServerUrl || "");
    if (!baseUrl) {
      return {
        ok: false,
        hasUpdate: false,
        latestVersion: "",
        downloadUrl: "",
        reason: "sync_server_url_missing",
      };
    }
    const currentVersion = getCurrentAppVersion();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/app-update?platform=android&version=${encodeURIComponent(currentVersion)}`
    );
    if (!res.ok) {
      return {
        ok: false,
        hasUpdate: false,
        latestVersion: "",
        downloadUrl: "",
        reason: `http_${res.status}`,
      };
    }
    const payload = (await res.json()) as Partial<AppUpdateInfo>;
    const latestVersion = String(payload.latestVersion || "");
    const downloadUrl = String(payload.downloadUrl || "");
    const hasUpdateByCompare = latestVersion ? compareVersion(latestVersion, currentVersion) > 0 : false;
    const hasUpdate = Boolean(payload.hasUpdate ?? hasUpdateByCompare);
    return {
      ok: true,
      hasUpdate,
      latestVersion,
      minimumVersion: String(payload.minimumVersion || ""),
      downloadUrl,
      notes: String(payload.notes || ""),
      force: Boolean(payload.force),
      publishedAt: String(payload.publishedAt || ""),
    };
  } catch (e: any) {
    return {
      ok: false,
      hasUpdate: false,
      latestVersion: "",
      downloadUrl: "",
      reason: String(e?.message || "update_check_failed"),
    };
  }
}

