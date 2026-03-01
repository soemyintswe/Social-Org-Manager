import { Platform } from 'react-native';

const REMOTE_CONFIG_KEYS = {
  SERVER_API_URL: 'server_api_url',
  APP_UPDATE_JSON_URL: 'app_update_json_url',
  CLOUD_SYNC_ENDPOINT: 'cloud_sync_endpoint',
  CLOUD_SYNC_API_KEY: 'cloud_sync_api_key',
  CLOUD_SYNC_ACCOUNT_EMAIL: 'cloud_sync_account_email',
  CLOUD_SYNC_FOLDER_NAME: 'cloud_sync_folder_name',
  MANAGED_SYNC_LOCKDOWN_ENABLED: 'managed_sync_lockdown_enabled',
  MANAGED_LAN_SYNC_URL: 'managed_lan_sync_url',
  MANAGED_LAN_SYNC_ENABLED: 'managed_lan_sync_enabled',
  MANAGED_CLOUD_SYNC_ENDPOINT: 'managed_cloud_sync_endpoint',
  MANAGED_CLOUD_SYNC_API_KEY: 'managed_cloud_sync_api_key',
  MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL: 'managed_cloud_sync_account_email',
  MANAGED_CLOUD_SYNC_FOLDER_NAME: 'managed_cloud_sync_folder_name',
  MANAGED_CLOUD_SYNC_ENABLED: 'managed_cloud_sync_enabled',
};

const REMOTE_CONFIG_ENV_FALLBACKS: Record<string, string> = {
  [REMOTE_CONFIG_KEYS.SERVER_API_URL]: String((process.env as any).EXPO_PUBLIC_SERVER_API_URL || ""),
  [REMOTE_CONFIG_KEYS.APP_UPDATE_JSON_URL]: String((process.env as any).EXPO_PUBLIC_APP_UPDATE_JSON_URL || ""),
  [REMOTE_CONFIG_KEYS.CLOUD_SYNC_ENDPOINT]: String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_ENDPOINT || ""),
  [REMOTE_CONFIG_KEYS.CLOUD_SYNC_API_KEY]: String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_API_KEY || ""),
  [REMOTE_CONFIG_KEYS.CLOUD_SYNC_ACCOUNT_EMAIL]: String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_ACCOUNT_EMAIL || ""),
  [REMOTE_CONFIG_KEYS.CLOUD_SYNC_FOLDER_NAME]: String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_FOLDER_NAME || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_SYNC_LOCKDOWN_ENABLED]: String((process.env as any).EXPO_PUBLIC_MANAGED_SYNC_LOCKDOWN_ENABLED || "true"),
  [REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_URL]: String((process.env as any).EXPO_PUBLIC_MANAGED_LAN_SYNC_URL || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_ENABLED]: String((process.env as any).EXPO_PUBLIC_MANAGED_LAN_SYNC_ENABLED || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENDPOINT]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_ENDPOINT || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_API_KEY]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_API_KEY || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_FOLDER_NAME]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_FOLDER_NAME || ""),
  [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENABLED]: String((process.env as any).EXPO_PUBLIC_MANAGED_CLOUD_SYNC_ENABLED || ""),
};

type RemoteConfigFactory = () => {
  getValue: (key: string) => { asString: () => string };
  setDefaults: (values: Record<string, string | number | boolean>) => Promise<void>;
  setConfigSettings: (settings: { minimumFetchIntervalMillis: number }) => Promise<void>;
  fetchAndActivate: () => Promise<boolean>;
};

let cachedRemoteConfigFactory: RemoteConfigFactory | null | undefined;

function getRemoteConfigFactory(): RemoteConfigFactory | null {
  if (Platform.OS === 'web') return null;
  if (cachedRemoteConfigFactory !== undefined) return cachedRemoteConfigFactory;
  try {
    const mod = require('@react-native-firebase/remote-config');
    cachedRemoteConfigFactory = (mod?.default || mod) as RemoteConfigFactory;
  } catch {
    cachedRemoteConfigFactory = null;
  }
  return cachedRemoteConfigFactory;
}

// Fallback to empty string or existing ENV var logic
export function getRemoteConfigString(key: string): string {
  const factory = getRemoteConfigFactory();
  if (!factory) return String(REMOTE_CONFIG_ENV_FALLBACKS[key] || '').trim();
  try {
    const raw = String(factory().getValue(key).asString() || '').trim();
    if (raw) return raw;
    return String(REMOTE_CONFIG_ENV_FALLBACKS[key] || '').trim();
  } catch {
    return String(REMOTE_CONFIG_ENV_FALLBACKS[key] || '').trim();
  }
}

function parseBoolean(raw: string): boolean | null {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return null;
}

export function getServerApiUrl(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.SERVER_API_URL);
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

export function getManagedLanSyncEnabled(): boolean | null {
  return parseBoolean(getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_ENABLED));
}

export function getManagedCloudSyncEnabled(): boolean | null {
  return parseBoolean(getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENABLED));
}

export function getManagedSyncLockdownEnabled(): boolean {
  const parsed = parseBoolean(getRemoteConfigString(REMOTE_CONFIG_KEYS.MANAGED_SYNC_LOCKDOWN_ENABLED));
  return parsed !== false;
}

export async function initializeRemoteConfig(
  minimumFetchIntervalMillis: number
): Promise<{ ok: boolean; fetched?: boolean; reason?: string }> {
  const factory = getRemoteConfigFactory();
  if (!factory) return { ok: false, reason: 'remote_config_unavailable' };
  try {
    await factory().setDefaults({
      welcome_message: 'Welcome to OrgHub',
      feature_new_ui_enabled: false,
      [REMOTE_CONFIG_KEYS.MANAGED_SYNC_LOCKDOWN_ENABLED]: true,
      [REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_URL]: '',
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENDPOINT]: '',
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_API_KEY]: '',
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL]: '',
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_FOLDER_NAME]: '',
      [REMOTE_CONFIG_KEYS.MANAGED_LAN_SYNC_ENABLED]: '',
      [REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENABLED]: '',
      [REMOTE_CONFIG_KEYS.CLOUD_SYNC_FOLDER_NAME]: '',
    });
    await factory().setConfigSettings({ minimumFetchIntervalMillis });
    const fetched = await factory().fetchAndActivate();
    return { ok: true, fetched };
  } catch (error: any) {
    return { ok: false, reason: String(error?.message || 'remote_config_init_failed') };
  }
}
