import type { StorageAdapter } from "../core/types";

/** Non-persistent storage: for tests, or as a fallback where native storage isn't available (e.g. Expo Go). */
export function createMemoryStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
