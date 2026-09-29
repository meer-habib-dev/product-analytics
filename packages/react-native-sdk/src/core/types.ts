import type { EventContext, EventProperties, WireEvent } from "@analytics/shared";

export type { EventContext, EventProperties, WireEvent };

/** What callers may pass as properties. Values are sanitized into flat primitives before queueing. */
export type PropertiesInput = Record<string, unknown>;

type MaybePromise<T> = T | Promise<T>;

/**
 * Minimal key-value storage used for the event queue and identity.
 * Synchronous stores (MMKV) and async ones (AsyncStorage) both fit.
 */
export interface StorageAdapter {
  getItem(key: string): MaybePromise<string | null | undefined>;
  setItem(key: string, value: string): MaybePromise<void>;
  removeItem(key: string): MaybePromise<void>;
}

export type AppStateStatus = "active" | "background" | "inactive" | (string & {});

export interface Logger {
  debug(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
}
