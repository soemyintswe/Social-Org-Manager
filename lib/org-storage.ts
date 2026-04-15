import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

type OrgStorageContext = {
  orgId: string | null;
  orgEmail: string | null;
};

const ACTIVE_ORG_ID_KEY = "@orghub_active_org_id";
const ACTIVE_ORG_EMAIL_KEY = "@orghub_active_org_email";
const LAST_CONNECTED_ORG_ID_KEY = "@orghub_last_connected_org_id";
const ACCOUNT_SETTINGS_KEY = "@orghub_account_settings";
const GLOBAL_KEYS = new Set<string>([
  "@orghub_system_admin_password",
  ACTIVE_ORG_ID_KEY,
  ACTIVE_ORG_EMAIL_KEY,
]);
const ORG_PREFIX_MARKER = "@orgdb:";
const SYSTEM_PREFIX_MARKER = "@sysdb:";
const LEGACY_ORG_ID = "ORG000";

let orgContext: OrgStorageContext = {
  orgId: null,
  orgEmail: null,
};
let activeOrgIdOverride: string | null = null;

function canUseWebStorage(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined";
}

function readWebSessionValue(key: string): string {
  if (!canUseWebStorage()) return "";
  try {
    return String(window.sessionStorage?.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function writeWebSessionValue(key: string, value: string): void {
  if (!canUseWebStorage()) return;
  try {
    if (value) {
      window.sessionStorage?.setItem(key, value);
    } else {
      window.sessionStorage?.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function readWebLocalValue(key: string): string {
  if (!canUseWebStorage()) return "";
  try {
    return String(window.localStorage?.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function writeWebLocalValue(key: string, value: string): void {
  if (!canUseWebStorage()) return;
  try {
    if (value) {
      window.localStorage?.setItem(key, value);
    } else {
      window.localStorage?.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function readInitialOrgOverride(): string {
  if (!canUseWebStorage()) return "";
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = normalizeOrgId(params.get("orgId"));
    if (fromQuery) return fromQuery;
    const fromSession =
      normalizeOrgId(readWebSessionValue(ACTIVE_ORG_ID_KEY)) ||
      normalizeOrgId(readWebSessionValue(LAST_CONNECTED_ORG_ID_KEY));
    if (fromSession) return fromSession;
    const fromLocal =
      normalizeOrgId(window.localStorage?.getItem(ACTIVE_ORG_ID_KEY) || "") ||
      normalizeOrgId(window.localStorage?.getItem(LAST_CONNECTED_ORG_ID_KEY) || "");
    return fromLocal;
  } catch {
    return "";
  }
}

const initialOverride = readInitialOrgOverride();
if (initialOverride) {
  activeOrgIdOverride = initialOverride;
}

function normalizeOrgId(orgId?: string | null): string {
  return String(orgId || "").trim().toUpperCase();
}

function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

export function setOrgStorageContext(input: { orgId?: string | null; orgEmail?: string | null }): void {
  const normalizedOrgId = normalizeOrgId(input.orgId);
  const normalizedEmail = normalizeEmail(input.orgEmail);
  orgContext = {
    orgId: normalizedOrgId,
    orgEmail: normalizedEmail,
  };
  // Keep active override aligned when a non-empty orgId is provided.
  if (normalizedOrgId) {
    activeOrgIdOverride = normalizedOrgId;
  }
}

export async function persistOrgStorageContext(input: { orgId?: string | null; orgEmail?: string | null }): Promise<void> {
  setOrgStorageContext(input);
  const orgId = normalizeOrgId(input.orgId);
  const orgEmail = normalizeEmail(input.orgEmail);
  // Do not clear override on empty orgId to avoid accidental fallback to legacy/global storage.
  if (orgId) {
    activeOrgIdOverride = orgId;
  }
  if (canUseWebStorage()) {
    if (orgId) {
      writeWebSessionValue(ACTIVE_ORG_ID_KEY, orgId);
      writeWebSessionValue(LAST_CONNECTED_ORG_ID_KEY, orgId);
      writeWebLocalValue(ACTIVE_ORG_ID_KEY, orgId);
      writeWebLocalValue(LAST_CONNECTED_ORG_ID_KEY, orgId);
    }
    if (orgEmail) {
      writeWebSessionValue(ACTIVE_ORG_EMAIL_KEY, orgEmail);
      writeWebLocalValue(ACTIVE_ORG_EMAIL_KEY, orgEmail);
    }
    return;
  }
  try {
    if (orgId) {
      await AsyncStorage.setItem(ACTIVE_ORG_ID_KEY, orgId);
    }
    if (orgEmail) {
      await AsyncStorage.setItem(ACTIVE_ORG_EMAIL_KEY, orgEmail);
    }
  } catch {
    // Ignore persistence errors; org context still set in memory.
  }
}

export async function restoreOrgStorageContext(): Promise<OrgStorageContext> {
  if (canUseWebStorage()) {
    const sessionOrgId = normalizeOrgId(readWebSessionValue(ACTIVE_ORG_ID_KEY));
    const sessionOrgEmail = normalizeEmail(readWebSessionValue(ACTIVE_ORG_EMAIL_KEY));
    const localOrgId = normalizeOrgId(
      readWebLocalValue(ACTIVE_ORG_ID_KEY) || readWebLocalValue(LAST_CONNECTED_ORG_ID_KEY)
    );
    const localOrgEmail = normalizeEmail(readWebLocalValue(ACTIVE_ORG_EMAIL_KEY));
    const orgId = sessionOrgId || localOrgId;
    const orgEmail = sessionOrgEmail || localOrgEmail;
    if (orgId || orgEmail) {
      activeOrgIdOverride = orgId || null;
      setOrgStorageContext({ orgId, orgEmail });
      return {
        orgId: orgId || null,
        orgEmail: orgEmail || null,
      };
    }
  }
  try {
    const rawOrgId = await AsyncStorage.getItem(ACTIVE_ORG_ID_KEY);
    const rawOrgEmail = await AsyncStorage.getItem(ACTIVE_ORG_EMAIL_KEY);
    const orgId = normalizeOrgId(rawOrgId);
    const orgEmail = normalizeEmail(rawOrgEmail);
    if (orgId || orgEmail) {
      activeOrgIdOverride = orgId || null;
      setOrgStorageContext({ orgId, orgEmail });
    }
    return {
      orgId: orgId || null,
      orgEmail: orgEmail || null,
    };
  } catch {
    return {
      orgId: normalizeOrgId(orgContext.orgId),
      orgEmail: normalizeEmail(orgContext.orgEmail),
    };
  }
}

export async function clearOrgScopedStorage(orgId?: string | null): Promise<void> {
  const resolvedId = normalizeOrgId(orgId || activeOrgIdOverride || orgContext.orgId);
  if (!resolvedId || resolvedId === LEGACY_ORG_ID) return;
  const prefix = `${ORG_PREFIX_MARKER}${resolvedId}:`;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const targets = (keys || []).filter((key) => key.startsWith(prefix));
    if (targets.length > 0) {
      await AsyncStorage.multiRemove(targets);
    }
  } catch {
    // ignore
  }
}

export function getOrgStoragePrefix(): string {
  const orgId = normalizeOrgId(activeOrgIdOverride || orgContext.orgId);
  if (!orgId) return "";
  if (orgId === LEGACY_ORG_ID) return "";
  return `${ORG_PREFIX_MARKER}${orgId}:`;
}

function isGlobalKey(key: string): boolean {
  return GLOBAL_KEYS.has(key);
}

function qualifyKey(key: string): string {
  if (!key) return key;
  if (isGlobalKey(key)) return key;
  const prefix = getOrgStoragePrefix();
  if (!prefix) return key;
  if (key.startsWith(prefix)) return key;
  return `${prefix}${key}`;
}

function stripKey(key: string): string {
  const prefix = getOrgStoragePrefix();
  if (prefix && key.startsWith(prefix)) return key.slice(prefix.length);
  return key;
}

async function filterKeysByOrg(keys: readonly string[]): Promise<string[]> {
  const prefix = getOrgStoragePrefix();
  if (!prefix) {
    return keys.filter((key) => !key.startsWith(ORG_PREFIX_MARKER) || isGlobalKey(key));
  }
  return keys
    .filter((key) => key.startsWith(prefix) || isGlobalKey(key))
    .map((key) => (isGlobalKey(key) ? key : key.slice(prefix.length)));
}

const orgStorage = {
  getItem: async (key: string) => {
    const qualifiedKey = qualifyKey(key);
    const value = await AsyncStorage.getItem(qualifiedKey);
    if (value !== null && value !== undefined) return value;

    if (key === ACCOUNT_SETTINGS_KEY) {
      const prefix = getOrgStoragePrefix();
      if (prefix) {
        const activeOrgId = normalizeOrgId(activeOrgIdOverride || orgContext.orgId);
        const legacyValue = await AsyncStorage.getItem(ACCOUNT_SETTINGS_KEY);
        if (legacyValue) {
          let legacyOrgId = "";
          try {
            const parsed = JSON.parse(legacyValue) as { orgId?: string };
            legacyOrgId = normalizeOrgId(parsed?.orgId);
          } catch {
            legacyOrgId = "";
          }
          if (activeOrgId && legacyOrgId && activeOrgId === legacyOrgId) {
            try {
              await AsyncStorage.setItem(qualifiedKey, legacyValue);
            } catch {
              // ignore copy failures and still return legacy value
            }
            return legacyValue;
          }
        }
      }
    }
    return value;
  },
  setItem: async (key: string, value: string) => AsyncStorage.setItem(qualifyKey(key), value),
  removeItem: async (key: string) => AsyncStorage.removeItem(qualifyKey(key)),
  multiGet: async (keys: readonly string[]) => {
    const qualifiedKeys = keys.map((key) => qualifyKey(key));
    const entries = await AsyncStorage.multiGet(qualifiedKeys);
    return entries.map(([key, value]) => [stripKey(key), value] as [string, string | null]);
  },
  multiSet: async (pairs: readonly [string, string][]) => {
    const qualifiedPairs = pairs.map(([key, value]) => [qualifyKey(key), value] as [string, string]);
    return AsyncStorage.multiSet(qualifiedPairs);
  },
  multiRemove: async (keys: readonly string[]) => {
    const qualifiedKeys = keys.map((key) => qualifyKey(key));
    return AsyncStorage.multiRemove(qualifiedKeys);
  },
  getAllKeys: async () => {
    const keys = await AsyncStorage.getAllKeys();
    return filterKeysByOrg(keys);
  },
};

export default orgStorage;

function qualifySystemKey(key: string): string {
  if (!key) return key;
  if (key.startsWith(SYSTEM_PREFIX_MARKER)) return key;
  return `${SYSTEM_PREFIX_MARKER}${key}`;
}

const systemStorage = {
  getItem: async (key: string) => AsyncStorage.getItem(qualifySystemKey(key)),
  setItem: async (key: string, value: string) => AsyncStorage.setItem(qualifySystemKey(key), value),
  removeItem: async (key: string) => AsyncStorage.removeItem(qualifySystemKey(key)),
  multiGet: async (keys: readonly string[]) => {
    const qualified = keys.map((key) => qualifySystemKey(key));
    const entries = await AsyncStorage.multiGet(qualified);
    return entries.map(([key, value]) => [key.replace(SYSTEM_PREFIX_MARKER, ""), value] as [string, string | null]);
  },
  multiSet: async (pairs: readonly [string, string][]) => {
    const qualified = pairs.map(([key, value]) => [qualifySystemKey(key), value] as [string, string]);
    return AsyncStorage.multiSet(qualified);
  },
  multiRemove: async (keys: readonly string[]) => {
    const qualified = keys.map((key) => qualifySystemKey(key));
    return AsyncStorage.multiRemove(qualified);
  },
};

export { systemStorage };
