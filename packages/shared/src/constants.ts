/**
 * Reserved events are emitted by the SDK itself. Only these `$`-prefixed
 * names are accepted by ingestion so the namespace stays ours to extend.
 */
export const RESERVED_EVENTS = {
  screen: "$screen",
  error: "$error",
  identify: "$identify",
  sessionStart: "$session_start",
  sessionEnd: "$session_end",
} as const;

export type ReservedEventName = (typeof RESERVED_EVENTS)[keyof typeof RESERVED_EVENTS];

export const RESERVED_EVENT_NAMES: ReadonlySet<string> = new Set(Object.values(RESERVED_EVENTS));

/** Hard limits enforced by the ingestion endpoint. The SDK mirrors them to avoid sending events that would be rejected. */
export const INGESTION_LIMITS = {
  maxRequestBytes: 512 * 1024,
  maxEventsPerBatch: 100,
  maxEventNameLength: 128,
  maxIdLength: 200,
  maxProperties: 100,
  maxPropertyKeyLength: 64,
  maxStringValueLength: 1024,
  /** Stack traces are the one value that legitimately needs more room. */
  maxStackLength: 8 * 1024,
  maxPropertiesBytes: 16 * 1024,
  maxContextValueLength: 128,
  /** Events older than this are rejected; it also bounds how long aggregation dedupe rows must be kept. */
  maxEventAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxFutureSkewMs: 5 * 60 * 1000,
} as const;

export const SDK_DEFAULTS = {
  flushAt: 20,
  flushIntervalMs: 10_000,
  maxBatchSize: 50,
  maxQueueSize: 1000,
  maxQueueBytes: 1024 * 1024,
  sessionTimeoutMs: 30 * 60 * 1000,
  requestTimeoutMs: 10_000,
  minBackoffMs: 1_000,
  maxBackoffMs: 5 * 60 * 1000,
} as const;

export const BATCH_PATH = "/v1/batch";

export const PLATFORMS = ["ios", "android", "web", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];
