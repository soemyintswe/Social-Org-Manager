import remoteConfig from '@react-native-firebase/remote-config';
import { Platform } from 'react-native';

const REMOTE_CONFIG_KEYS = {
  SERVER_API_URL: 'server_api_url',
  APP_UPDATE_JSON_URL: 'app_update_json_url',
  CLOUD_SYNC_ENDPOINT: 'cloud_sync_endpoint',
  CLOUD_SYNC_API_KEY: 'cloud_sync_api_key',
  CLOUD_SYNC_ACCOUNT_EMAIL: 'cloud_sync_account_email',
};

// Fallback to empty string or existing ENV var logic
export function getRemoteConfigString(key: string): string {
  if (Platform.OS === 'web') return '';
  try {
    return remoteConfig().getValue(key).asString();
  } catch (error) {
    // console.warn(`Error getting remote config for key ${key}:`, error);
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
