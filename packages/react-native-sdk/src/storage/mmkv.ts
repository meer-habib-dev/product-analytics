import { createMMKV } from "react-native-mmkv";
import type { StorageAdapter } from "../core/types";

/** Structural type so an existing MMKV instance (v3 `delete` or v4 `remove`) can be reused. */
export interface MMKVLike {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove?(key: string): unknown;
  delete?(key: string): unknown;
}

/**
 * Default storage. MMKV is synchronous, so a queued event is on disk
 * immediately, which matters when the app crashes right after an error.
 */
export function createMMKVStorage(instance?: MMKVLike): StorageAdapter {
  const mmkv: MMKVLike = instance ?? createMMKV({ id: "analytics" });
  return {
    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => mmkv.set(key, value),
    removeItem: (key) => {
      if (mmkv.remove) mmkv.remove(key);
      else mmkv.delete?.(key);
    },
  };
}

/** Adapter for `@react-native-async-storage/async-storage` or any async key-value store. */
export function createAsyncStorageAdapter(store: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}): StorageAdapter {
  return {
    getItem: (key) => store.getItem(key),
    setItem: (key, value) => store.setItem(key, value),
    removeItem: (key) => store.removeItem(key),
  };
}
