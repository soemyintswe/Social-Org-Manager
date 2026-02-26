import remoteConfig from '@react-native-firebase/remote-config';
import { Platform } from 'react-native';

const REMOTE_CONFIG_KEYS = {
  SERVER_API_URL: 'server_api_url',
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
  const remoteUrl = getRemoteConfigString(REMOTE_CONFIG_KEYS.SERVER_API_URL);
  if (remoteUrl) return remoteUrl;
  
  // Fallback if needed
  // Note: We don't check process.env.EXPO_PUBLIC_DOMAIN here directly
  // to avoid circular dependency or context issues. The caller (getApiUrl)
  // handles the final fallback.
  return '';
}
