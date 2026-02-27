import { Platform } from 'react-native';

const REMOTE_CONFIG_KEYS = {
  SERVER_API_URL: 'server_api_url',
  APP_UPDATE_JSON_URL: 'app_update_json_url',
  CLOUD_SYNC_ENDPOINT: 'cloud_sync_endpoint',
  CLOUD_SYNC_API_KEY: 'cloud_sync_api_key',
  CLOUD_SYNC_ACCOUNT_EMAIL: 'cloud_sync_account_email',
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
  if (!factory) return '';
  try {
    return factory().getValue(key).asString();
  } catch {
    return '';
  }
}

export function getServerApiUrl(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.SERVER_API_URL);
}

export function getAppUpdateJsonUrl(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.APP_UPDATE_JSON_URL);
}

export function getCloudSyncEndpoint(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.CLOUD_SYNC_ENDPOINT);
}

export function getCloudSyncApiKey(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.CLOUD_SYNC_API_KEY);
}

export function getCloudSyncAccountEmail(): string {
  return getRemoteConfigString(REMOTE_CONFIG_KEYS.CLOUD_SYNC_ACCOUNT_EMAIL);
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
    });
    await factory().setConfigSettings({ minimumFetchIntervalMillis });
    const fetched = await factory().fetchAndActivate();
    return { ok: true, fetched };
  } catch (error: any) {
    return { ok: false, reason: String(error?.message || 'remote_config_init_failed') };
  }
}
