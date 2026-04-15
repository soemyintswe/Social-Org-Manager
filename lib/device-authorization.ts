import orgStorage from "./org-storage";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import {
  getDeviceAuthAllowedHashes,
  getDeviceAuthCacheHours,
  getDeviceAuthFirestoreCollection,
  getDeviceAuthOrgId,
  getDeviceAuthRequired,
} from "./remote-config";

type DeviceAuthSource = "disabled" | "cache" | "firestore" | "remote_allow_list" | "fallback";

export type DeviceAuthorizationResult = {
  ok: boolean;
  authorized: boolean;
  required: boolean;
  source: DeviceAuthSource;
  deviceHash: string;
  checkedAt: string;
  reason?: string;
};

type DeviceAuthorizationCache = {
  authorized: boolean;
  checkedAt: string;
  source: DeviceAuthSource;
  reason?: string;
  deviceHash: string;
};

const INSTALLATION_ID_KEY = "@orghub_installation_id_v1";
const DEVICE_AUTH_CACHE_KEY = "@orghub_device_auth_cache_v1";

async function getOrCreateInstallationId(): Promise<string> {
  const existing = String((await orgStorage.getItem(INSTALLATION_ID_KEY)) || "").trim();
  if (existing) return existing;
  const created = String(Crypto.randomUUID()).replace(/-/g, "");
  await orgStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

async function getRawDeviceIdentifier(): Promise<string> {
  const parts: string[] = [];
  const appId = String((Application as any).applicationId || "").trim();
  if (appId) parts.push(`app:${appId}`);

  const nativeBuild = String((Application as any).nativeBuildVersion || "").trim();
  if (nativeBuild) parts.push(`build:${nativeBuild}`);

  if (Platform.OS === "android") {
    const androidId = String((Application as any).androidId || "").trim();
    if (androidId) parts.push(`aid:${androidId}`);
  }

  if (Platform.OS === "ios") {
    try {
      const iosId = String((await (Application as any).getIosIdForVendorAsync?.()) || "").trim();
      if (iosId) parts.push(`iid:${iosId}`);
    } catch {}
  }

  const installId = await getOrCreateInstallationId();
  parts.push(`install:${installId}`);

  return parts.join("|");
}

export async function getDeviceAuthorizationHash(): Promise<string> {
  const raw = await getRawDeviceIdentifier();
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
}

function parseDateMs(value: unknown): number {
  const text = String(value || "").trim();
  if (!text) return 0;
  const ms = new Date(text).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

async function readCachedAuthorization(deviceHash: string): Promise<DeviceAuthorizationCache | null> {
  try {
    const raw = String((await orgStorage.getItem(DEVICE_AUTH_CACHE_KEY)) || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceAuthorizationCache;
    if (!parsed || parsed.deviceHash !== deviceHash) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedAuthorization(result: DeviceAuthorizationResult): Promise<void> {
  const payload: DeviceAuthorizationCache = {
    authorized: result.authorized,
    checkedAt: result.checkedAt,
    source: result.source,
    reason: result.reason,
    deviceHash: result.deviceHash,
  };
  await orgStorage.setItem(DEVICE_AUTH_CACHE_KEY, JSON.stringify(payload));
}

function isCacheStillValid(cache: DeviceAuthorizationCache, cacheHours: number): boolean {
  if (!cache.authorized) return false;
  const checkedMs = parseDateMs(cache.checkedAt);
  if (checkedMs <= 0) return false;
  const ttlMs = Math.max(1, cacheHours) * 60 * 60 * 1000;
  return Date.now() - checkedMs <= ttlMs;
}

async function verifyFromFirestore(deviceHash: string): Promise<{ authorized: boolean; reason?: string } | null> {
  let firestoreFactory: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/firestore");
    firestoreFactory = mod?.default || mod;
  } catch {
    return null;
  }

  if (!firestoreFactory) return null;

  const orgId = String(getDeviceAuthOrgId() || "default").trim();
  const collection = String(getDeviceAuthFirestoreCollection() || "managedDeviceAuthorizations").trim();

  try {
    const db = firestoreFactory();
    const docSnap = await db
      .collection(collection)
      .doc(orgId)
      .collection("devices")
      .doc(deviceHash)
      .get();

    if (!docSnap.exists) return { authorized: false, reason: "device_not_registered" };
    const row = (docSnap.data?.() || {}) as any;

    const revoked = row.revoked === true || row.authorized === false || row.enabled === false;
    if (revoked) return { authorized: false, reason: "device_revoked" };

    const expiresAtMs = parseDateMs(row.expiresAt);
    if (expiresAtMs > 0 && Date.now() > expiresAtMs) {
      return { authorized: false, reason: "device_authorization_expired" };
    }

    return { authorized: true };
  } catch (error: any) {
    return { authorized: false, reason: String(error?.message || "firestore_auth_failed") };
  }
}

export async function verifyDeviceAuthorization(options?: {
  forceOnlineCheck?: boolean;
}): Promise<DeviceAuthorizationResult> {
  const required = getDeviceAuthRequired();
  const checkedAt = new Date().toISOString();
  const deviceHash = await getDeviceAuthorizationHash();

  if (!required) {
    const result: DeviceAuthorizationResult = {
      ok: true,
      authorized: true,
      required,
      source: "disabled",
      deviceHash,
      checkedAt,
    };
    await writeCachedAuthorization(result);
    return result;
  }

  const cacheHours = getDeviceAuthCacheHours();
  const cached = await readCachedAuthorization(deviceHash);
  if (!options?.forceOnlineCheck && cached && isCacheStillValid(cached, cacheHours)) {
    return {
      ok: true,
      authorized: true,
      required,
      source: "cache",
      deviceHash,
      checkedAt,
      reason: cached.reason,
    };
  }

  const firestoreResult = await verifyFromFirestore(deviceHash);
  if (firestoreResult && firestoreResult.authorized) {
    const result: DeviceAuthorizationResult = {
      ok: true,
      authorized: true,
      required,
      source: "firestore",
      deviceHash,
      checkedAt,
    };
    await writeCachedAuthorization(result);
    return result;
  }

  const allowList = getDeviceAuthAllowedHashes();
  if (allowList.includes(deviceHash)) {
    const result: DeviceAuthorizationResult = {
      ok: true,
      authorized: true,
      required,
      source: "remote_allow_list",
      deviceHash,
      checkedAt,
    };
    await writeCachedAuthorization(result);
    return result;
  }

  // Offline tolerance: if Firestore is unavailable but last known cache was authorized, keep app usable.
  if (cached && cached.authorized && isCacheStillValid(cached, cacheHours)) {
    return {
      ok: true,
      authorized: true,
      required,
      source: "cache",
      deviceHash,
      checkedAt,
      reason: "offline_cache_grace",
    };
  }

  const reason =
    firestoreResult?.reason ||
    "device_not_authorized";

  const denied: DeviceAuthorizationResult = {
    ok: false,
    authorized: false,
    required,
    source: "fallback",
    deviceHash,
    checkedAt,
    reason,
  };
  await writeCachedAuthorization(denied);
  return denied;
}

export async function getDeviceRegistrationInfo(): Promise<{ deviceHash: string; orgId: string }> {
  return {
    deviceHash: await getDeviceAuthorizationHash(),
    orgId: getDeviceAuthOrgId(),
  };
}
