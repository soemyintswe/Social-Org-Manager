import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import orgStorage, { systemStorage } from "./org-storage";
import { toEnglishDigits } from "./member-utils";
import { setRegistryManagedOrgConfig } from "./remote-config";

export type OrgRegistryEntry = {
  orgId: string;
  org: {
    name: string;
    location?: string;
    email?: string;
    phone: string;
    memberCount?: number;
  };
  contact: {
    name: string;
    email?: string;
    phone: string;
    address?: string;
  };
  technical: {
    managed_cloud_sync_endpoint?: string;
    managed_cloud_sync_api_key?: string;
    managed_cloud_sync_account_email?: string;
    managed_cloud_sync_folder_name?: string;
    managed_cloud_sync_enabled?: boolean | string;
    managed_lan_sync_url?: string;
    managed_lan_sync_enabled?: boolean | string;
    managed_sync_lockdown_enabled?: boolean | string;
    server_api_url?: string;
  };
  license: {
    status: "allow" | "deny";
    startDate?: string;
    expiryDate?: string;
    denyExpiryDate?: string;
  };
  chair: {
    name: string;
    email?: string;
    phone: string;
    password: string;
    passwordUpdatedAt?: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type OrgRegistryLicenseCheck = {
  ok: boolean;
  allowed: boolean;
  reason?: string;
  status?: string;
  expiryDate?: string;
  source?: "firestore" | "cache" | "missing";
};

type RegistryCacheEntry = {
  entry: OrgRegistryEntry;
  cachedAt: string;
};

const REGISTRY_CACHE_KEY = "@orghub_org_registry_cache_v1";
const REGISTRY_COLLECTION = String(
  (process.env as any).EXPO_PUBLIC_ORG_REGISTRY_COLLECTION || "orgRegistry"
).trim();

type FirebaseWebConfig = {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
};

let cachedWebFirestore: { db: any } | null = null;
let cachedWebFirestoreError: string | null = null;

function normalizeOrgId(raw?: string | null): string {
  return String(raw || "").trim().toUpperCase();
}

function normalizeEmail(raw?: string | null): string {
  return String(raw || "").trim().toLowerCase();
}

function normalizePhone(raw?: string | null): string {
  return toEnglishDigits(String(raw || "")).replace(/[^\d]/g, "");
}

function parseDateMs(value: unknown): number {
  const raw = String(value || "").trim();
  if (!raw) return 0;

  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const parsed = new Date(year, month - 1, day).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const parsed = new Date(year, month - 1, day).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLicenseStatus(raw?: string | null): "allow" | "deny" {
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "allow" || normalized === "active" || normalized === "enabled") return "allow";
  if (normalized === "deny" || normalized === "inactive" || normalized === "disabled") return "deny";
  return "deny";
}

function buildGeneratedPassword(): string {
  try {
    const uuid = Crypto.randomUUID().replace(/-/g, "").toUpperCase();
    const token = uuid.slice(0, 4);
    const numericSeed = parseInt(uuid.slice(4, 8), 16);
    const suffix = 100 + (Number.isFinite(numericSeed) ? numericSeed % 900 : 0);
    return `ORG${token}${suffix}`;
  } catch {
    const fallback = String(Date.now()).slice(-6);
    return `ORG${fallback}`;
  }
}

function getFirestoreFactory(): any | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/firestore");
    return mod?.default || mod;
  } catch {
    return null;
  }
}

function normalizeFirebaseWebConfig(raw: unknown): FirebaseWebConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const apiKey = String(obj.apiKey || "").trim();
  const projectId = String(obj.projectId || "").trim();
  const appId = String(obj.appId || "").trim();
  if (!apiKey || !projectId || !appId) return null;
  const authDomain = String(obj.authDomain || "").trim();
  const storageBucket = String(obj.storageBucket || "").trim();
  const messagingSenderId = String(obj.messagingSenderId || "").trim();
  const measurementId = String(obj.measurementId || "").trim();
  return {
    apiKey,
    projectId,
    appId,
    authDomain: authDomain || undefined,
    storageBucket: storageBucket || undefined,
    messagingSenderId: messagingSenderId || undefined,
    measurementId: measurementId || undefined,
  };
}

function getGlobalFirebaseConfig(): FirebaseWebConfig | null {
  try {
    const globalAny = globalThis as Record<string, any> | undefined;
    const value = globalAny?.__APP_CONFIG__?.firebaseConfig;
    if (!value) return null;
    if (typeof value === "string") {
      try {
        return normalizeFirebaseWebConfig(JSON.parse(value));
      } catch {
        return null;
      }
    }
    return normalizeFirebaseWebConfig(value);
  } catch {
    return null;
  }
}

function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const globalConfig = getGlobalFirebaseConfig();
  if (globalConfig) return globalConfig;

  const rawJson = String((process.env as any).EXPO_PUBLIC_FIREBASE_CONFIG_JSON || "").trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      const normalized = normalizeFirebaseWebConfig(parsed);
      if (normalized) return normalized;
    } catch {
      // ignore invalid json
    }
  }

  const apiKey = String((process.env as any).EXPO_PUBLIC_FIREBASE_API_KEY || "").trim();
  const projectId = String((process.env as any).EXPO_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  const appId = String((process.env as any).EXPO_PUBLIC_FIREBASE_APP_ID || "").trim();
  if (!apiKey || !projectId || !appId) return null;
  const authDomain = String((process.env as any).EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "").trim();
  const storageBucket = String((process.env as any).EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  const messagingSenderId = String((process.env as any).EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "").trim();
  const measurementId = String((process.env as any).EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "").trim();
  return normalizeFirebaseWebConfig({
    apiKey,
    projectId,
    appId,
    authDomain,
    storageBucket,
    messagingSenderId,
    measurementId,
  });
}

async function getFirestoreWeb(): Promise<{ db?: any; reason?: string }> {
  if (Platform.OS !== "web") return { reason: "not_web" };
  if (cachedWebFirestore) return { db: cachedWebFirestore.db };
  if (cachedWebFirestoreError) return { reason: cachedWebFirestoreError };

  const config = getFirebaseWebConfig();
  if (!config) {
    cachedWebFirestoreError = "firebase_web_not_configured";
    return { reason: cachedWebFirestoreError };
  }

  try {
    const appModule = await import("firebase/app");
    const firestoreModule = await import("firebase/firestore");
    const app =
      appModule.getApps().length > 0
        ? appModule.getApp()
        : appModule.initializeApp(config);
    const db = firestoreModule.getFirestore(app);
    cachedWebFirestore = { db };
    return { db };
  } catch (error: any) {
    cachedWebFirestoreError = String(error?.message || "firestore_web_init_failed");
    return { reason: cachedWebFirestoreError };
  }
}

function normalizeRegistryEntry(raw: any, orgIdOverride?: string): OrgRegistryEntry {
  const normalizedId = normalizeOrgId(orgIdOverride || raw?.orgId || raw?.id);
  const orgEmail = normalizeEmail(raw?.org?.email || raw?.orgEmail);
  const orgPhone = normalizePhone(raw?.org?.phone || raw?.orgPhone);
  const contactEmail = normalizeEmail(raw?.contact?.email || raw?.contactEmail);
  const contactPhone = normalizePhone(raw?.contact?.phone || raw?.contactPhone);
  const chairEmail = normalizeEmail(raw?.chair?.email || raw?.chairEmail);
  const chairPhone = normalizePhone(raw?.chair?.phone || raw?.chairPhone);
  const memberCountRaw = raw?.org?.memberCount ?? raw?.memberCount;
  const memberCount = Number.isFinite(Number(memberCountRaw)) ? Math.max(0, Number(memberCountRaw)) : undefined;
  const licenseStatus = normalizeLicenseStatus(raw?.license?.status || raw?.licenseStatus);
  const licenseStartDate = String(raw?.license?.startDate || raw?.licenseStartDate || "").trim();
  const licenseExpiry = String(raw?.license?.expiryDate || raw?.licenseExpiry || "").trim();
  const licenseDenyExpiry = String(raw?.license?.denyExpiryDate || raw?.licenseDenyExpiryDate || "").trim();

  return {
    orgId: normalizedId,
    org: {
      name: String(raw?.org?.name || raw?.orgName || "").trim(),
      location: String(raw?.org?.location || raw?.orgLocation || "").trim() || undefined,
      email: orgEmail || undefined,
      phone: orgPhone,
      memberCount,
    },
    contact: {
      name: String(raw?.contact?.name || raw?.contactName || "").trim(),
      email: contactEmail || undefined,
      phone: contactPhone,
      address: String(raw?.contact?.address || raw?.contactAddress || "").trim() || undefined,
    },
    technical: {
      managed_cloud_sync_endpoint: String(
        raw?.technical?.managed_cloud_sync_endpoint || raw?.managed_cloud_sync_endpoint || ""
      ).trim() || undefined,
      managed_cloud_sync_api_key: String(
        raw?.technical?.managed_cloud_sync_api_key || raw?.managed_cloud_sync_api_key || ""
      ).trim() || undefined,
      managed_cloud_sync_account_email: String(
        raw?.technical?.managed_cloud_sync_account_email || raw?.managed_cloud_sync_account_email || ""
      ).trim() || undefined,
      managed_cloud_sync_folder_name: String(
        raw?.technical?.managed_cloud_sync_folder_name || raw?.managed_cloud_sync_folder_name || ""
      ).trim() || undefined,
      managed_cloud_sync_enabled: raw?.technical?.managed_cloud_sync_enabled ?? raw?.managed_cloud_sync_enabled,
      managed_lan_sync_url: String(
        raw?.technical?.managed_lan_sync_url || raw?.managed_lan_sync_url || ""
      ).trim() || undefined,
      managed_lan_sync_enabled: raw?.technical?.managed_lan_sync_enabled ?? raw?.managed_lan_sync_enabled,
      managed_sync_lockdown_enabled:
        raw?.technical?.managed_sync_lockdown_enabled ?? raw?.managed_sync_lockdown_enabled,
      server_api_url: String(raw?.technical?.server_api_url || raw?.server_api_url || "").trim() || undefined,
    },
    license: {
      status: licenseStatus,
      startDate: licenseStartDate || undefined,
      expiryDate: licenseExpiry || undefined,
      denyExpiryDate: licenseDenyExpiry || undefined,
    },
    chair: {
      name: String(raw?.chair?.name || raw?.chairName || "").trim(),
      email: chairEmail || undefined,
      phone: chairPhone,
      password: String(raw?.chair?.password || raw?.chairPassword || "").trim(),
      passwordUpdatedAt: String(raw?.chair?.passwordUpdatedAt || raw?.chairPasswordUpdatedAt || "").trim() || undefined,
    },
    createdAt: String(raw?.createdAt || "").trim() || undefined,
    updatedAt: String(raw?.updatedAt || "").trim() || undefined,
  };
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    Object.keys(input).forEach((key) => {
      const v = input[key];
      if (v === undefined) return;
      cleaned[key] = stripUndefined(v);
    });
    return cleaned as T;
  }
  return value;
}

function applyRegistryManagedConfig(entry: OrgRegistryEntry): void {
  if (!entry?.orgId) return;
  setRegistryManagedOrgConfig(entry.orgId, {
    orgEmail: entry.org.email,
    managed_cloud_sync_endpoint: entry.technical.managed_cloud_sync_endpoint,
    managed_cloud_sync_api_key: entry.technical.managed_cloud_sync_api_key,
    managed_cloud_sync_account_email: entry.technical.managed_cloud_sync_account_email,
    managed_cloud_sync_folder_name: entry.technical.managed_cloud_sync_folder_name,
    managed_cloud_sync_enabled: entry.technical.managed_cloud_sync_enabled,
    managed_lan_sync_url: entry.technical.managed_lan_sync_url,
    managed_lan_sync_enabled: entry.technical.managed_lan_sync_enabled,
    managed_sync_lockdown_enabled: entry.technical.managed_sync_lockdown_enabled,
    server_api_url: entry.technical.server_api_url,
  });
}

async function readRegistryCache(): Promise<Record<string, RegistryCacheEntry>> {
  try {
    const sysRaw = String((await systemStorage.getItem(REGISTRY_CACHE_KEY)) || "").trim();
    if (sysRaw) {
      const parsed = JSON.parse(sysRaw);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, RegistryCacheEntry>;
      }
    }
  } catch {
    // fall through to legacy cache read
  }
  try {
    const raw = String((await orgStorage.getItem(REGISTRY_CACHE_KEY)) || "").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // Migrate legacy org-scoped cache into system storage.
    try {
      await systemStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify(parsed));
      await orgStorage.removeItem(REGISTRY_CACHE_KEY);
    } catch {
      // ignore migration errors
    }
    return parsed as Record<string, RegistryCacheEntry>;
  } catch {
    return {};
  }
}

async function writeRegistryCache(cache: Record<string, RegistryCacheEntry>): Promise<void> {
  await systemStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify(cache));
}

export async function cacheOrgRegistryEntry(entry: OrgRegistryEntry): Promise<void> {
  const orgId = normalizeOrgId(entry?.orgId);
  if (!orgId) return;
  const cache = await readRegistryCache();
  cache[orgId] = {
    entry: normalizeRegistryEntry(entry, orgId),
    cachedAt: new Date().toISOString(),
  };
  await writeRegistryCache(cache);
  applyRegistryManagedConfig(cache[orgId].entry);
}

export async function hydrateRegistryManagedConfig(orgId?: string | null): Promise<void> {
  const target = normalizeOrgId(orgId);
  if (!target) return;
  const cache = await readRegistryCache();
  const cached = cache[target]?.entry;
  if (cached) applyRegistryManagedConfig(cached);
}

export async function fetchOrgRegistryEntry(orgId: string): Promise<{ ok: boolean; entry?: OrgRegistryEntry; reason?: string }> {
  const id = normalizeOrgId(orgId);
  if (!id) return { ok: false, reason: "missing_org_id" };

  if (Platform.OS === "web") {
    const web = await getFirestoreWeb();
    if (!web.db) {
      const cache = await readRegistryCache();
      const cached = cache[id]?.entry;
      if (cached) return { ok: true, entry: cached, reason: "cache_fallback" };
      return { ok: false, reason: web.reason || "firestore_unavailable" };
    }
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const docRef = doc(web.db, REGISTRY_COLLECTION, id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        const cache = await readRegistryCache();
        const cached = cache[id]?.entry;
        if (cached) return { ok: true, entry: cached, reason: "cache_fallback" };
        return { ok: false, reason: "org_not_registered" };
      }
      const data = docSnap.data() || {};
      const entry = normalizeRegistryEntry({ ...data, orgId: id }, id);
      return { ok: true, entry };
    } catch (error: any) {
      const cache = await readRegistryCache();
      const cached = cache[id]?.entry;
      if (cached) return { ok: true, entry: cached, reason: "cache_fallback" };
      return { ok: false, reason: String(error?.message || "registry_fetch_failed") };
    }
  }

  const firestoreFactory = getFirestoreFactory();
  if (!firestoreFactory) {
    const cache = await readRegistryCache();
    const cached = cache[id]?.entry;
    if (cached) return { ok: true, entry: cached, reason: "cache_fallback" };
    return { ok: false, reason: "firestore_unavailable" };
  }

  try {
    const db = firestoreFactory();
    const docSnap = await db.collection(REGISTRY_COLLECTION).doc(id).get();
    if (!docSnap.exists) {
      const cache = await readRegistryCache();
      const cached = cache[id]?.entry;
      if (cached) return { ok: true, entry: cached, reason: "cache_fallback" };
      return { ok: false, reason: "org_not_registered" };
    }
    const data = docSnap.data?.() || {};
    const entry = normalizeRegistryEntry({ ...data, orgId: id }, id);
    return { ok: true, entry };
  } catch (error: any) {
    const cache = await readRegistryCache();
    const cached = cache[id]?.entry;
    if (cached) return { ok: true, entry: cached, reason: "cache_fallback" };
    return { ok: false, reason: String(error?.message || "registry_fetch_failed") };
  }
}

export async function listOrgRegistryEntries(): Promise<{ ok: boolean; entries?: OrgRegistryEntry[]; reason?: string }> {
  const cache = await readRegistryCache();
  const cachedEntries = Object.values(cache || {}).map((item) => normalizeRegistryEntry(item.entry, item.entry.orgId));

  if (Platform.OS === "web") {
    const web = await getFirestoreWeb();
    if (!web.db) {
      if (cachedEntries.length > 0) {
        return { ok: true, entries: cachedEntries, reason: "cache_fallback" };
      }
      return { ok: false, reason: web.reason || "firestore_unavailable" };
    }
    try {
      const { collection, getDocs } = await import("firebase/firestore");
      const colRef = collection(web.db, REGISTRY_COLLECTION);
      const snap = await getDocs(colRef);
      const entries = snap.docs
        .map((docSnap) => normalizeRegistryEntry({ ...docSnap.data(), orgId: docSnap.id }, docSnap.id))
        .sort((a, b) => a.orgId.localeCompare(b.orgId));
      if (entries.length === 0 && cachedEntries.length > 0) {
        return { ok: true, entries: cachedEntries, reason: "cache_fallback_empty_firestore" };
      }
      return { ok: true, entries };
    } catch (error: any) {
      if (cachedEntries.length > 0) {
        return { ok: true, entries: cachedEntries, reason: "cache_fallback" };
      }
      return { ok: false, reason: String(error?.message || "registry_list_failed") };
    }
  }

  const firestoreFactory = getFirestoreFactory();
  if (!firestoreFactory) {
    if (cachedEntries.length > 0) {
      return { ok: true, entries: cachedEntries, reason: "cache_fallback" };
    }
    return { ok: false, reason: "firestore_unavailable" };
  }

  try {
    const db = firestoreFactory();
    const snapshot = await db.collection(REGISTRY_COLLECTION).get();
    const entries = snapshot.docs
      .map((docSnap: any) => normalizeRegistryEntry({ ...docSnap.data?.(), orgId: docSnap.id }, docSnap.id))
      .sort((a: OrgRegistryEntry, b: OrgRegistryEntry) => a.orgId.localeCompare(b.orgId));
    if (entries.length === 0 && cachedEntries.length > 0) {
      return { ok: true, entries: cachedEntries, reason: "cache_fallback_empty_firestore" };
    }
    return { ok: true, entries };
  } catch (error: any) {
    if (cachedEntries.length > 0) {
      return { ok: true, entries: cachedEntries, reason: "cache_fallback" };
    }
    return { ok: false, reason: String(error?.message || "registry_list_failed") };
  }
}

export async function upsertOrgRegistryEntry(input: OrgRegistryEntry): Promise<{ ok: boolean; entry?: OrgRegistryEntry; reason?: string }> {
  const orgId = normalizeOrgId(input?.orgId);
  if (!orgId) return { ok: false, reason: "missing_org_id" };
  if (Platform.OS === "web") {
    const web = await getFirestoreWeb();
    if (!web.db) return { ok: false, reason: web.reason || "firestore_unavailable" };
    try {
      const { doc, getDoc, setDoc } = await import("firebase/firestore");
      const docRef = doc(web.db, REGISTRY_COLLECTION, orgId);
      const existing = await getDoc(docRef);
      const now = new Date().toISOString();
      const normalized = normalizeRegistryEntry(input, orgId);
      const existingCreatedAt = existing.exists() ? (existing.data() as any)?.createdAt : undefined;
      const payload: OrgRegistryEntry = {
        ...normalized,
        orgId,
        createdAt: String(existingCreatedAt || normalized.createdAt || now),
        updatedAt: now,
      };
      const cleanedPayload = stripUndefined(payload);
      await setDoc(docRef, cleanedPayload, { merge: true });
      await cacheOrgRegistryEntry(payload);
      return { ok: true, entry: payload };
    } catch (error: any) {
      return { ok: false, reason: String(error?.message || "registry_upsert_failed") };
    }
  }

  const firestoreFactory = getFirestoreFactory();
  if (!firestoreFactory) return { ok: false, reason: "firestore_unavailable" };

  try {
    const db = firestoreFactory();
    const docRef = db.collection(REGISTRY_COLLECTION).doc(orgId);
    const existing = await docRef.get();
    const now = new Date().toISOString();
    const normalized = normalizeRegistryEntry(input, orgId);
    const payload: OrgRegistryEntry = {
      ...normalized,
      orgId,
      createdAt: String(existing?.data?.()?.createdAt || normalized.createdAt || now),
      updatedAt: now,
    };
    const cleanedPayload = stripUndefined(payload);
    await docRef.set(cleanedPayload, { merge: true });
    await cacheOrgRegistryEntry(payload);
    return { ok: true, entry: payload };
  } catch (error: any) {
    return { ok: false, reason: String(error?.message || "registry_upsert_failed") };
  }
}

export function evaluateOrgLicense(entry?: OrgRegistryEntry | null): OrgRegistryLicenseCheck {
  if (!entry) {
    return { ok: false, allowed: false, reason: "license_missing", source: "missing" };
  }
  const status = normalizeLicenseStatus(entry.license?.status);
  const startDate = String(entry.license?.startDate || "").trim();
  const expiry = String(entry.license?.expiryDate || "").trim();
  const denyExpiry = String(entry.license?.denyExpiryDate || "").trim();
  if (status === "allow" && startDate) {
    const startMs = parseDateMs(startDate);
    if (startMs > 0 && Date.now() < startMs) {
      return { ok: false, allowed: false, reason: "license_not_started", status, expiryDate: expiry };
    }
  }
  if (status === "deny") {
    if (denyExpiry) {
      const denyMs = parseDateMs(denyExpiry);
      if (denyMs > 0 && Date.now() > denyMs) {
        return { ok: true, allowed: true, reason: "deny_expired", status, expiryDate: expiry };
      }
    }
    return { ok: false, allowed: false, reason: "license_denied", status, expiryDate: expiry };
  }
  if (expiry) {
    const expiryMs = parseDateMs(expiry);
    if (expiryMs > 0 && Date.now() > expiryMs) {
      return { ok: false, allowed: false, reason: "license_expired", status, expiryDate: expiry };
    }
  }
  return { ok: true, allowed: true, status, expiryDate: expiry };
}

export async function ensureOrgLicenseActive(input?: {
  orgId?: string | null;
  forceOnlineCheck?: boolean;
}): Promise<OrgRegistryLicenseCheck> {
  const orgId = normalizeOrgId(input?.orgId);
  if (!orgId) return { ok: true, allowed: true, source: "missing" };
  const isLegacyOrg = orgId === "ORG000";

  let entry: OrgRegistryEntry | null = null;
  let source: "firestore" | "cache" | "missing" = "missing";

  if (input?.forceOnlineCheck) {
    const fetchResult = await fetchOrgRegistryEntry(orgId);
    if (fetchResult.ok && fetchResult.entry) {
      entry = fetchResult.entry;
      source = "firestore";
      await cacheOrgRegistryEntry(entry);
    }
  }

  if (!entry) {
    const cache = await readRegistryCache();
    const cached = cache[orgId]?.entry;
    if (cached) {
      entry = cached;
      source = "cache";
      applyRegistryManagedConfig(cached);
    }
  }

  if (!entry) {
    if (isLegacyOrg) {
      return { ok: true, allowed: true, reason: "legacy_org_allow", source };
    }
    return { ok: false, allowed: false, reason: "license_missing", source };
  }

  const license = evaluateOrgLicense(entry);
  return { ...license, source };
}

export async function verifyOrgRegistryCredentials(input: {
  orgId: string;
  orgEmail?: string;
  orgPhone?: string;
}): Promise<{ ok: boolean; entry?: OrgRegistryEntry; reason?: string; license?: OrgRegistryLicenseCheck }> {
  const orgId = normalizeOrgId(input.orgId);
  if (!orgId) return { ok: false, reason: "missing_org_id" };
  const email = normalizeEmail(input.orgEmail);
  const phone = normalizePhone(input.orgPhone);

  if (!email && !phone) {
    return { ok: false, reason: "missing_org_credentials" };
  }

  const fetchResult = await fetchOrgRegistryEntry(orgId);
  if (!fetchResult.ok || !fetchResult.entry) {
    return { ok: false, reason: fetchResult.reason || "org_not_registered" };
  }

  const entry = fetchResult.entry;
  const registryEmail = normalizeEmail(entry.org.email);
  const registryPhone = normalizePhone(entry.org.phone);

  if (email) {
    if (!registryEmail) {
      if (phone) {
        if (registryPhone && registryPhone === phone) {
          await cacheOrgRegistryEntry(entry);
          return { ok: true, entry, license: evaluateOrgLicense(entry) };
        }
        return { ok: false, reason: "org_phone_mismatch" };
      }
      return { ok: false, reason: "org_email_missing" };
    }
    if (registryEmail !== email) {
      return { ok: false, reason: "org_email_mismatch" };
    }
  } else if (phone) {
    if (!registryPhone) return { ok: false, reason: "org_phone_missing" };
    if (registryPhone !== phone) return { ok: false, reason: "org_phone_mismatch" };
  }

  await cacheOrgRegistryEntry(entry);
  return { ok: true, entry, license: evaluateOrgLicense(entry) };
}

export function buildOrgRegistryEntry(input: {
  orgId: string;
  orgName: string;
  orgLocation?: string;
  orgEmail?: string;
  orgPhone: string;
  memberCount?: number | string;
  contactName: string;
  contactEmail?: string;
  contactPhone: string;
  contactAddress?: string;
  managedCloudSyncEndpoint: string;
  managedCloudSyncApiKey?: string;
  managedCloudSyncAccountEmail?: string;
  managedCloudSyncFolderName?: string;
  managedCloudSyncEnabled?: boolean | string;
  licenseStatus: "allow" | "deny" | string;
  licenseExpiry?: string;
  licenseStartDate?: string;
  licenseDenyExpiryDate?: string;
  chairName: string;
  chairEmail?: string;
  chairPhone: string;
  chairPassword?: string;
  chairPasswordUpdatedAt?: string;
}): OrgRegistryEntry {
  const chairPassword =
    String(input.chairPassword || "").trim() || buildGeneratedPassword();
  return normalizeRegistryEntry({
    orgId: input.orgId,
    org: {
      name: input.orgName,
      location: input.orgLocation,
      email: input.orgEmail,
      phone: input.orgPhone,
      memberCount: Number.isFinite(Number(input.memberCount)) ? Number(input.memberCount) : undefined,
    },
    contact: {
      name: input.contactName,
      email: input.contactEmail,
      phone: input.contactPhone,
      address: input.contactAddress,
    },
    technical: {
      managed_cloud_sync_endpoint: input.managedCloudSyncEndpoint,
      managed_cloud_sync_api_key: input.managedCloudSyncApiKey,
      managed_cloud_sync_account_email: input.managedCloudSyncAccountEmail,
      managed_cloud_sync_folder_name: input.managedCloudSyncFolderName,
      managed_cloud_sync_enabled: input.managedCloudSyncEnabled,
    },
    license: {
      status: normalizeLicenseStatus(input.licenseStatus),
      startDate: input.licenseStartDate,
      expiryDate: input.licenseExpiry,
      denyExpiryDate: input.licenseDenyExpiryDate,
    },
    chair: {
      name: input.chairName,
      email: input.chairEmail,
      phone: input.chairPhone,
      password: chairPassword,
      passwordUpdatedAt: input.chairPasswordUpdatedAt,
    },
  });
}

export function generateOrgChairPassword(): string {
  return buildGeneratedPassword();
}
