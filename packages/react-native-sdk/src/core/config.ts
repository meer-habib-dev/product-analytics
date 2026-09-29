import { INGESTION_LIMITS, SDK_DEFAULTS } from "@analytics/shared";
import type { EventContext, StorageAdapter } from "./types";

export interface AnalyticsConfig {
  /** Public project ingestion key (`proj_...`). Safe to ship in the app binary. */
  apiKey: string;
  /** Base URL of the ingestion endpoint, e.g. your Convex site URL `https://<deployment>.convex.site`. */
  host: string;
  /** Logs queue/transport activity to the console. */
  debug?: boolean;
  /** Set to false (e.g. in __DEV__) to turn the SDK into a no-op. */
  enabled?: boolean;
  /** Flush once this many events are queued. Default 20. */
  flushAt?: number;
  /** Flush on this interval while events are queued. Default 10s. */
  flushIntervalMs?: number;
  /** Events per HTTP request. Default 50, max 100. */
  maxBatchSize?: number;
  /** Oldest events are dropped beyond this many queued events. Default 1000. */
  maxQueueSize?: number;
  /** Oldest events are dropped beyond this many serialized bytes. Default 1 MB. */
  maxQueueBytes?: number;
  /** Inactivity after which a new session starts. Default 30 min. */
  sessionTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** Emit `$session_start` / `$session_end`. Default true. */
  trackSessions?: boolean;
  /** Capture uncaught JS errors as fatal `$error` events. Default true. */
  captureUncaughtErrors?: boolean;
  /** Replace the default MMKV storage. */
  storage?: StorageAdapter;
  /** Static context overrides, e.g. `{ appVersion }` in bare apps without expo-application. */
  context?: Partial<EventContext>;
}

export type ResolvedConfig = Required<Omit<AnalyticsConfig, "storage" | "context">> &
  Pick<AnalyticsConfig, "storage" | "context">;

export function resolveConfig(config: AnalyticsConfig): ResolvedConfig {
  return {
    apiKey: config.apiKey,
    host: config.host.replace(/\/+$/, ""),
    debug: config.debug ?? false,
    enabled: config.enabled ?? true,
    flushAt: clamp(config.flushAt ?? SDK_DEFAULTS.flushAt, 1, INGESTION_LIMITS.maxEventsPerBatch),
    flushIntervalMs: Math.max(1000, config.flushIntervalMs ?? SDK_DEFAULTS.flushIntervalMs),
    maxBatchSize: clamp(config.maxBatchSize ?? SDK_DEFAULTS.maxBatchSize, 1, INGESTION_LIMITS.maxEventsPerBatch),
    maxQueueSize: Math.max(1, config.maxQueueSize ?? SDK_DEFAULTS.maxQueueSize),
    maxQueueBytes: Math.max(10_000, config.maxQueueBytes ?? SDK_DEFAULTS.maxQueueBytes),
    sessionTimeoutMs: Math.max(10_000, config.sessionTimeoutMs ?? SDK_DEFAULTS.sessionTimeoutMs),
    requestTimeoutMs: Math.max(1000, config.requestTimeoutMs ?? SDK_DEFAULTS.requestTimeoutMs),
    trackSessions: config.trackSessions ?? true,
    captureUncaughtErrors: config.captureUncaughtErrors ?? true,
    storage: config.storage,
    context: config.context,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
