import { Platform } from "react-native";
import Constants from "expo-constants";

export const REMOTE_CONFIG_KEYS = {
  SERVER_API_URL: "server_api_url",
  APP_UPDATE_JSON_URL: "app_update_json_url",
  CLOUD_SYNC_ENDPOINT: "cloud_sync_endpoint",
  CLOUD_SYNC_API_KEY: "cloud_sync_api_key",
  CLOUD_SYNC_ACCOUNT_EMAIL: "cloud_sync_account_email",
  CLOUD_SYNC_FOLDER_NAME: "cloud_sync_folder_name",
  MANAGED_SYNC_LOCKDOWN_ENABLED: "managed_sync_lockdown_enabled",
  MANAGED_LAN_SYNC_URL: "managed_lan_sync_url",
  MANAGED_LAN_SYNC_ENABLED: "managed_lan_sync_enabled",
  MANAGED_CLOUD_SYNC_ENDPOINT: "managed_cloud_sync_endpoint",
  MANAGED_CLOUD_SYNC_API_KEY: "managed_cloud_sync_api_key",
  MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL: "managed_cloud_sync_account_email",
  MANAGED_CLOUD_SYNC_FOLDER_NAME: "managed_cloud_sync_folder_name",
  MANAGED_CLOUD_SYNC_ENABLED: "managed_cloud_sync_enabled",
  MANAGED_ORG_CONFIGS: "managed_org_configs",
  DEVICE_AUTH_REQUIRED: "device_auth_required",
  DEVICE_AUTH_ALLOWED_HASHES: "device_auth_allowed_hashes",
  DEVICE_AUTH_ORG_ID: "device_auth_org_id",
  DEVICE_AUTH_FIRESTORE_COLLECTION: "device_auth_firestore_collection",
  DEVICE_AUTH_CACHE_HOURS: "device_auth_cache_hours",
  SYNC_RETRY_MAX_ATTEMPTS: "sync_retry_max_attempts",
  SYNC_RETRY_BASE_DELAY_MS: "sync_retry_base_delay_ms",
} as const;

export const REMOTE_CONFIG_ENV_FALLBACKS: Record<string, string> = {
  [REMOTE_CONFIG_KEYS.SERVER_API_URL]: String((process.env as any).EXPO_PUBLIC_SERVER_API_URL || ""),
  [REMOTE_CONFIG_KEYS.APP_UPDATE_JSON_URL]: String((process.env as any).EXPO_PUBLIC_APP_UPDATE_JSON_URL || ""),
  [REMOTE_CONFIG_KEYS.CLOUD_SYNC_ENDPOINT]: String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_ENDPOINT || ""),
  [REMOTE_CONFIG_KEYS.CLOUD_SYNC_API_KEY]: String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_API_KEY || ""),
  [REMOTE_CONFIG_KEYS.CLOUD_SYNC_ACCOUNT_EMAIL]: String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_ACCOUNT_EMAIL || ""),
  [REMOTE_CONFIG_KEYS.CLOUD_SYNC_FOLDER_NAME]: String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_FOLDER_NAME || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_SYNC_LOCKDOWN_ENABLED]: String((process.env as any).EXPO_PUBLIC_MANAGED_SYNC_LOCKDOWN_ENABLED || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_URL]: String((process.env as any).EXPO_PUBLIC_MANAGED_LAN_SYNC_URL || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_ENABLED]: String((process.env as any).EXPO_PUBLIC_MANAGED_LAN_SYNC_ENABLED || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENDPOINT]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_ENDPOINT || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_API_KEY]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_API_KEY || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_FOLDER_NAME]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_FOLDER_NAME || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENABLED]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_ENABLED || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_ORG_CONFIGS]: String((process.env as any).EXPO_PUBLIC_MANAGED_ORG_CONFIGS || ""),
  [REMOTE_CONFIG_KEYS.DEVICE_AUTH_REQUIRED]: String((process.env as any).EXPO_PUBLIC_DEVICE_AUTH_REQUIRED || ""),
  [REMOTE_CONFIG_KEYS.DEVICE_AUTH_ALLOWED_HASHES]: String((process.env as any).EXPO_PUBLIC_DEVICE_AUTH_ALLOWED_HASHES || ""),
  [REMOTE_CONFIG_KEYS.DEVICE_AUTH_ORG_ID]: String((process.env as any).EXPO_PUBLIC_DEVICE_AUTH_ORG_ID || "default"),
  [REMOTE_CONFIG_KEYS.DEVICE_AUTH_FIRESTORE_COLLECTION]: String((process.env as any).EXPO_PUBLIC_DEVICE_AUTH_FIRESTORE_COLLECTION || "managedDeviceAuthorizations"),
  [REMOTE_CONFIG_KEYS.DEVICE_AUTH_CACHE_HOURS]: String((process.env as any).EXPO_PUBLIC_DEVICE_AUTH_CACHE_HOURS || "24"),
  [REMOTE_CONFIG_KEYS.SYNC_RETRY_MAX_ATTEMPTS]: String((process.env as any).EXPO_PUBLIC_SYNC_RETRY_MAX_ATTEMPTS || "5"),
  [REMOTE_CONFIG_KEYS.SYNC_RETRY_BASE_DELAY_MS]: String((process.env as any).EXPO_PUBLIC_SYNC_RETRY_BASE_DELAY_MS || "600"),
};

const EXPO_EXTRA_KEY_MAP: Record<string, string> = {
  [REMOTE_CONFIG_KEYS.MANAGED_ORG_CONFIGS]: "managedOrgConfigs",
};

type ManagedOrgConfig = {
  orgEmail?: string;
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

type ManagedOrgConfigMap = Record<string, ManagedOrgConfig>;

type RemoteConfigFactory = () => {
  getValue: (key: string) => { asString: () => string };
  setDefaults: (values: Record<string, string | number | boolean>) => Promise<void>;
  setConfigSettings: (settings: { minimumFetchIntervalMillis: number }) => Promise<void>;
  fetchAndActivate: () => Promise<boolean>;
};

let cachedRemoteConfigFactory: RemoteConfigFactory | null | undefined;
let cachedManagedOrgConfigRaw = "";
let cachedManagedOrgConfigParsed: ManagedOrgConfigMap | null = null;
let activeOrgId: string | null = null;
const registryManagedOrgConfigs: ManagedOrgConfigMap = {};
const USE_MANAGED_ORG_CONFIGS =
  String((process.env as any).EXPO_PUBLIC_USE_MANAGED_ORG_CONFIGS || "")
    .trim()
    .toLowerCase() === "true";

function getRemoteConfigFactory(): RemoteConfigFactory | null {
  if (Platform.OS === "web") return null;
  if (cachedRemoteConfigFactory !== undefined) return cachedRemoteConfigFactory;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/remote-config");
    cachedRemoteConfigFactory = (mod?.default || mod) as RemoteConfigFactory;
  } catch {
    cachedRemoteConfigFactory = null;
  }
  return cachedRemoteConfigFactory;
}

function parseBoolean(raw: string): boolean | null {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return null;
}

function parsePositiveInt(raw: string): number | null {
  const n = Number(String(raw || "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function normalizeOrgId(raw?: string | null): string {
  return String(raw || "").trim().toUpperCase();
}

function getGlobalConfigString(key: string): string {
  try {
    const extraKey = EXPO_EXTRA_KEY_MAP[key];
    if (!extraKey) return "";
    const globalAny = globalThis as Record<string, any> | undefined;
    const value = globalAny?.__APP_CONFIG__?.[extraKey];
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value.trim();
    try {
      return JSON.stringify(value);
    } catch {
      return String(value).trim();
    }
  } catch {
    return "";
  }
}

function getExpoExtraString(key: string): string {
  try {
    const extraKey = EXPO_EXTRA_KEY_MAP[key];
    if (!extraKey) return "";
    const extra = (Constants?.expoConfig || Constants?.manifest)?.extra as Record<string, any> | undefined;
    const value = extra?.[extraKey];
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value.trim();
    try {
      return JSON.stringify(value);
    } catch {
      return String(value).trim();
    }
  } catch {
    return "";
  }
}

export function getRemoteConfigStringRaw(key: string): string {
  const factory = getRemoteConfigFactory();
  if (!factory) return "";
  try {
    return String(factory().getValue(key).asString() || "").trim();
  } catch {
    return "";
  }
}

export function getEnvFallbackString(key: string): string {
  const env = String(REMOTE_CONFIG_ENV_FALLBACKS[key] || "").trim();
  if (env) return env;
  const globalValue = getGlobalConfigString(key);
  if (globalValue) return globalValue;
  return getExpoExtraString(key);
}

function parseManagedOrgConfigs(raw: string): ManagedOrgConfigMap {
  if (!raw) return {};
  try {
    let parsed: unknown = raw;
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    const parsedObject = parsed as Record<string, ManagedOrgConfig> | null;
    if (!parsedObject || typeof parsedObject !== "object") return {};
    const normalized: ManagedOrgConfigMap = {};
    for (const [orgKey, value] of Object.entries(parsedObject)) {
      if (!value || typeof value !== "object") continue;
      normalized[normalizeOrgId(orgKey)] = value;
    }
    return normalized;
  } catch {
    return {};
  }
}

function getManagedOrgConfigs(): ManagedOrgConfigMap {
  if (!USE_MANAGED_ORG_CONFIGS) return {};
  const raw = getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_ORG_CONFIGS);
  if (raw === cachedManagedOrgConfigRaw && cachedManagedOrgConfigParsed) {
    return cachedManagedOrgConfigParsed;
  }
  cachedManagedOrgConfigRaw = raw;
  cachedManagedOrgConfigParsed = parseManagedOrgConfigs(raw);
  return cachedManagedOrgConfigParsed;
}

export function setRegistryManagedOrgConfig(orgId: string, config?: ManagedOrgConfig | null): void {
  const normalized = normalizeOrgId(orgId);
  if (!normalized) return;
  if (!config) {
    delete registryManagedOrgConfigs[normalized];
    return;
  }
  registryManagedOrgConfigs[normalized] = config;
}

function getRegistryManagedOrgConfig(orgId?: string | null): ManagedOrgConfig | null {
  const normalized = normalizeOrgId(orgId);
  if (!normalized) return null;
  return registryManagedOrgConfigs[normalized] || null;
}

export function setActiveOrgId(orgId: string | null): void {
  const normalized = normalizeOrgId(orgId);
  activeOrgId = normalized || null;
}

export function getActiveOrgId(): string | null {
  return activeOrgId ? normalizeOrgId(activeOrgId) : null;
}

export function prewarmOrgScopedRemoteConfig(orgId?: string | null): void {
  if (orgId) setActiveOrgId(orgId);
  getManagedOrgConfigs();
}

export function validateManagedOrgCredentials(
  orgId: string,
  orgEmail: string
): { ok: boolean; reason?: string } {
  const id = normalizeOrgId(orgId);
  const email = String(orgEmail || "").trim().toLowerCase();
  if (!id || !email) {
    return { ok: false, reason: "missing_org_credentials" };
  }
  const configs = getManagedOrgConfigs();
  const config = configs[id];
  if (!config) {
    return { ok: false, reason: "org_not_registered" };
  }
  const configEmail = String(config.orgEmail || "").trim().toLowerCase();
  if (!configEmail) {
    return { ok: false, reason: "org_email_missing" };
  }
  if (configEmail !== email) {
    return { ok: false, reason: "org_email_mismatch" };
  }
  return { ok: true };
}

function getOrgConfigValue(orgId: string | null | undefined, key: string): string {
  const normalized = normalizeOrgId(orgId);
  if (!normalized) return "";
  const registryConfig = getRegistryManagedOrgConfig(normalized);
  if (registryConfig && Object.prototype.hasOwnProperty.call(registryConfig, key)) {
    const raw = (registryConfig as Record<string, unknown>)[key];
    return String(raw ?? "").trim();
  }
  const configs = getManagedOrgConfigs();
  const config = configs[normalized];
  if (!config) return "";
  const raw = (config as Record<string, unknown>)[key];
  return String(raw ?? "").trim();
}

export function resolveConfigValueWithPriorityForOrg(input: {
  key: string;
  orgId?: string | null;
  manualValue?: string | null;
}): { value: string; source: "manual" | "org_config" | "remote_config" | "env" | "empty" } {
  const manual = String(input.manualValue || "").trim();
  if (manual) return { value: manual, source: "manual" };

  const orgValue = getOrgConfigValue(input.orgId || null, input.key);
  if (orgValue) return { value: orgValue, source: "org_config" };

  const remote = getRemoteConfigStringRaw(input.key);
  if (remote) return { value: remote, source: "remote_config" };

  const env = getEnvFallbackString(input.key);
  if (env) return { value: env, source: "env" };

  return { value: "", source: "empty" };
}

export function resolveConfigValueWithPriority(input: {
  key: string;
  manualValue?: string | null;
}): { value: string; source: "manual" | "remote_config" | "env" | "empty" } {
  const manual = String(input.manualValue || "").trim();
  if (manual) return { value: manual, source: "manual" };

  const remote = getRemoteConfigStringRaw(input.key);
  if (remote) return { value: remote, source: "remote_config" };

  const env = getEnvFallbackString(input.key);
  if (env) return { value: env, source: "env" };

  return { value: "", source: "empty" };
}

// Backward compatible helper: Remote Config -> ENV fallback.
export function getRemoteConfigString(key: string): string {
  const remote = getRemoteConfigStringRaw(key);
  if (remote) return remote;
  return getEnvFallbackString(key);
}

export function getServerApiUrl(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.SERVER_API_URL);
}

export function getServerApiUrlForOrg(orgId?: string | null): string {
  const resolved = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.SERVER_API_URL,
    orgId,
  });
  return resolved.value || getServerApiUrl();
}

export function getAppUpdateJsonUrl(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.APP_UPDATE_JSON_URL);
}

export function getCloudSyncEndpoint(): string {
  return (
    getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENDPOINT) ||
    getRemoteConfigString(REMOTE_CONFIG_KEYS.CLOUD_SYNC_ENDPOINT)
  );
}

export function getCloudSyncApiKey(): string {
  return (
    getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_API_KEY) ||
    getRemoteConfigString(REMOTE_CONFIG_KEYS.CLOUD_SYNC_API_KEY)
  );
}

export function getCloudSyncAccountEmail(): string {
  return (
    getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL) ||
    getRemoteConfigString(REMOTE_CONFIG_KEYS.CLOUD_SYNC_ACCOUNT_EMAIL)
  );
}

export function getCloudSyncFolderName(): string {
  return (
    getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_FOLDER_NAME) ||
    getRemoteConfigString(REMOTE_CONFIG_KEYS.CLOUD_SYNC_FOLDER_NAME)
  );
}

export function getManagedLanSyncUrl(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_URL);
}

export function getManagedLanSyncUrlForOrg(orgId?: string | null): string {
  const resolved = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_URL,
    orgId,
  });
  return resolved.value;
}

export function getManagedLanSyncEnabled(): boolean | null {
  return parseBoolean(getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_ENABLED));
}

export function getManagedCloudSyncEnabled(): boolean | null {
  return parseBoolean(getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENABLED));
}

function hasManagedSyncOverridesConfigured(): boolean {
  return Boolean(
    getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_URL) ||
      getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENDPOINT) ||
      getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_API_KEY) ||
      getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL) ||
      getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_FOLDER_NAME)
  );
}

export function getManagedSyncLockdownEnabled(): boolean {
  const parsed = parseBoolean(getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_SYNC_LOCKDOWN_ENABLED));
  if (parsed !== null) return parsed;
  return hasManagedSyncOverridesConfigured();
}

export function getDeviceAuthRequired(): boolean {
  const parsed = parseBoolean(getRemoteConfigString(REMOTE_CONFIG_KEYS.DEVICE_AUTH_REQUIRED));
  if (parsed !== null) return parsed;
  return false;
}

export function getDeviceAuthAllowedHashes(): string[] {
  const raw = getRemoteConfigString(REMOTE_CONFIG_KEYS.DEVICE_AUTH_ALLOWED_HASHES);
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((row) => row.trim())
    .filter(Boolean);
}

export function getDeviceAuthOrgId(): string {
  const raw = getRemoteConfigString(REMOTE_CONFIG_KEYS.DEVICE_AUTH_ORG_ID);
  return raw || "default";
}

export function getDeviceAuthFirestoreCollection(): string {
  const raw = getRemoteConfigString(REMOTE_CONFIG_KEYS.DEVICE_AUTH_FIRESTORE_COLLECTION);
  return raw || "managedDeviceAuthorizations";
}

export function getDeviceAuthCacheHours(): number {
  const parsed = parsePositiveInt(getRemoteConfigString(REMOTE_CONFIG_KEYS.DEVICE_AUTH_CACHE_HOURS));
  return parsed || 24;
}

export function getSyncRetryMaxAttempts(): number {
  const parsed = parsePositiveInt(getRemoteConfigString(REMOTE_CONFIG_KEYS.SYNC_RETRY_MAX_ATTEMPTS));
  return parsed || 5;
}

export function getSyncRetryBaseDelayMs(): number {
  const parsed = parsePositiveInt(getRemoteConfigString(REMOTE_CONFIG_KEYS.SYNC_RETRY_BASE_DELAY_MS));
  return parsed || 600;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutReason: string): Promise<T> {
  const ms = Math.max(1000, Math.floor(timeoutMs || 0));
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutReason));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function initializeRemoteConfig(
  minimumFetchIntervalMillis: number
): Promise<{ ok: boolean; fetched?: boolean; reason?: string }> {
  const factory = getRemoteConfigFactory();
  if (!factory) return { ok: false, reason: "remote_config_unavailable" };
  const remote = factory();
  try {
    await remote.setDefaults({
      welcome_message: "Welcome to OrgHub",
      feature_new_ui_enabled: false,
      [REMOTE_CONFIG_KEYS.MANAGED_SYNC_LOCKDOWN_ENABLED]: false,
      [REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_URL]: "",
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENDPOINT]: "",
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_API_KEY]: "",
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL]: "",
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_FOLDER_NAME]: "",
      [REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_ENABLED]: "",
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENABLED]: "",
      [REMOTE_CONFIG_KEYS.MANAGED_ORG_CONFIGS]: "{}",
      [REMOTE_CONFIG_KEYS.CLOUD_SYNC_FOLDER_NAME]: "",
      [REMOTE_CONFIG_KEYS.DEVICE_AUTH_REQUIRED]: false,
      [REMOTE_CONFIG_KEYS.DEVICE_AUTH_ALLOWED_HASHES]: "",
      [REMOTE_CONFIG_KEYS.DEVICE_AUTH_ORG_ID]: "default",
      [REMOTE_CONFIG_KEYS.DEVICE_AUTH_FIRESTORE_COLLECTION]: "managedDeviceAuthorizations",
      [REMOTE_CONFIG_KEYS.DEVICE_AUTH_CACHE_HOURS]: 24,
      [REMOTE_CONFIG_KEYS.SYNC_RETRY_MAX_ATTEMPTS]: 5,
      [REMOTE_CONFIG_KEYS.SYNC_RETRY_BASE_DELAY_MS]: 600,
    });
    await remote.setConfigSettings({ minimumFetchIntervalMillis });
    const fetched = await withTimeout(
      remote.fetchAndActivate(),
      12000,
      "remote_config_fetch_timeout"
    );
    return { ok: true, fetched };
  } catch (error: any) {
    // Fail-safe: app should continue with ENV/manual fallbacks.
    return {
      ok: true,
      fetched: false,
      reason: String(error?.message || "remote_config_init_failed"),
    };
  }
}
