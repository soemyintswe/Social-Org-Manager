// Storage Service (Phase 1)
// - Provides a single indirection point for data persistence.
// - Default provider is the legacy AsyncStorage-based implementation.
// - Future providers (SQLite/Postgres/HTTP) can be swapped via setStorageProvider.

import * as legacyStorage from "./storage";
export * from "./storage";

export type StorageProvider = typeof legacyStorage;

// Keep a stable object reference so existing imports remain valid even when provider changes.
export const storageService: StorageProvider = {
  ...legacyStorage,
};

export function setStorageProvider(next: StorageProvider): void {
  Object.assign(storageService, next);
}

export function getStorageProvider(): StorageProvider {
  return storageService;
}
