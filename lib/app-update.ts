import Constants from "expo-constants";
import * as Application from "expo-application";
import { getAccountSettings } from "@/lib/storage-service";
import { getAppUpdateJsonUrl } from "@/lib/remote-config";

export type AppUpdateInfo = {
  ok: boolean;
  hasUpdate: boolean;
  latestVersion: string;
  latestBuildNumber?: string;
  minimumVersion?: string;
  downloadUrl: string;
  notes?: string;
  force?: boolean;
  publishedAt?: string;
  reason?: string;
};

const DEFAULT_GITHUB_APP_UPDATE_JSON_URLS = [
  String((process.env as any).EXPO_PUBLIC_APP_UPDATE_JSON_URL || "").trim(),
  "https://raw.githubusercontent.com/soemyintswe/Social-Org-Manager/main/server/config/app-update.json",
  "https://raw.githubusercontent.com/soemyintswe/Social-Org-Manager/feature/expense-management-system/server/config/app-update.json",
].filter(Boolean);

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
    String((Application as any).nativeApplicationVersion || "") ||
    String((Constants as any).nativeAppVersion || "") ||
    String((Constants as any).expoConfig?.version || "") ||
    "0.0.0"
  );
}

export function getCurrentBuildNumber(): string {
  return (
    String((Application as any).nativeBuildVersion || "") ||
    String((Constants as any).nativeBuildVersion || "") ||
    ""
  );
}

function parseBuildNumber(value: string): number | null {
  const n = Number(String(value || "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeUrl(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function withCacheBust(url: string): string {
  try {
    const target = new URL(url);
    target.searchParams.set("_ts", String(Date.now()));
    return target.toString();
  } catch {
    return url;
  }
}

function getRemoteUpdateJsonCandidates(remoteUrlRaw: string): string[] {
  const fromRemoteConfig = String(remoteUrlRaw || "").trim();
  return Array.from(new Set([fromRemoteConfig, ...DEFAULT_GITHUB_APP_UPDATE_JSON_URLS].filter(Boolean)));
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function mapPayloadToInfo(payload: Partial<AppUpdateInfo>, currentVersion: string, currentBuild: string): AppUpdateInfo {
  const latestVersion = String(payload.latestVersion || "");
  const latestBuildNumber = String((payload as any).latestBuildNumber || "");
  const minimumVersion = String(payload.minimumVersion || "");
  const downloadUrl = String(payload.downloadUrl || "");
  const hasUpdateByCompare = latestVersion ? compareVersion(latestVersion, currentVersion) > 0 : false;
  const currentBuildNum = parseBuildNumber(currentBuild);
  const latestBuildNum = parseBuildNumber(latestBuildNumber);
  const hasUpdateByBuild =
    currentBuildNum !== null && latestBuildNum !== null
      ? latestBuildNum > currentBuildNum
      : false;
  const mustUpdateByMinimumVersion =
    minimumVersion && currentVersion
      ? compareVersion(minimumVersion, currentVersion) > 0
      : false;
  const hasUpdate = Boolean(
    payload.force ||
      payload.hasUpdate ||
      hasUpdateByCompare ||
      hasUpdateByBuild ||
      mustUpdateByMinimumVersion
  );
  return {
    ok: true,
    hasUpdate,
    latestVersion,
    latestBuildNumber,
    minimumVersion,
    downloadUrl,
    notes: String(payload.notes || ""),
    force: Boolean(payload.force || mustUpdateByMinimumVersion),
    publishedAt: String(payload.publishedAt || ""),
  };
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  const currentVersion = getCurrentAppVersion();
  const currentBuild = getCurrentBuildNumber();
  let lastReason = "update_check_failed";
  let bestInfo: AppUpdateInfo | null = null;

  const pickBetter = (nextInfo: AppUpdateInfo) => {
    if (!nextInfo.ok || !nextInfo.latestVersion) return;
    if (!bestInfo) {
      bestInfo = nextInfo;
      return;
    }
    const cmpVersion = compareVersion(nextInfo.latestVersion, bestInfo.latestVersion);
    if (cmpVersion > 0) {
      bestInfo = nextInfo;
      return;
    }
    if (cmpVersion < 0) return;

    const nextBuild = parseBuildNumber(nextInfo.latestBuildNumber || "");
    const bestBuild = parseBuildNumber(bestInfo.latestBuildNumber || "");
    if (nextBuild !== null && bestBuild !== null && nextBuild > bestBuild) {
      bestInfo = nextInfo;
      return;
    }

    const nextPublished = new Date(String(nextInfo.publishedAt || "")).getTime();
    const bestPublished = new Date(String(bestInfo.publishedAt || "")).getTime();
    if (Number.isFinite(nextPublished) && Number.isFinite(bestPublished) && nextPublished > bestPublished) {
      bestInfo = nextInfo;
    }
  };

  // 1) LAN source
  try {
    const settings = await getAccountSettings();
    const baseUrl = normalizeUrl(settings.syncServerUrl || "");
    const lanSyncEnabled = settings.syncEnabled !== false && !!baseUrl;
    if (lanSyncEnabled) {
      try {
        const res = await fetchWithTimeout(
          `${baseUrl}/api/app-update?platform=android&version=${encodeURIComponent(currentVersion)}&build=${encodeURIComponent(currentBuild)}`,
          3000 // Short timeout for LAN check
        );
        if (res.ok) {
          const payload = (await res.json()) as Partial<AppUpdateInfo>;
          pickBetter(mapPayloadToInfo(payload, currentVersion, currentBuild));
        } else {
          lastReason = `lan_http_${res.status}`;
        }
      } catch (e: any) {
        lastReason = String(e?.message || "lan_update_check_failed");
      }
    }
  } catch {
    // Ignore storage errors
  }

  // 2) Remote config JSON + GitHub fallbacks
  const candidates = getRemoteUpdateJsonCandidates(getAppUpdateJsonUrl());
  for (const candidate of candidates) {
    try {
      const res = await fetchWithTimeout(withCacheBust(candidate), 10000);
      if (!res.ok) {
        lastReason = `http_${res.status}`;
        continue;
      }
      const payload = (await res.json()) as Partial<AppUpdateInfo>;
      const mapped = mapPayloadToInfo(payload, currentVersion, currentBuild);
      pickBetter(mapped);
    } catch (e: any) {
      lastReason = String(e?.message || "update_check_failed");
    }
  }

  if (bestInfo) return bestInfo;

  return {
    ok: false,
    hasUpdate: false,
    latestVersion: "",
    latestBuildNumber: "",
    downloadUrl: "",
    reason: lastReason,
  };
}
