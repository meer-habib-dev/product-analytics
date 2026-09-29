import type { Platform } from "./constants";

/** Property values are flat primitives so they can be stored, filtered and broken down without schema surprises. */
export type PropertyValue = string | number | boolean | null;
export type EventProperties = Record<string, PropertyValue>;

export interface EventContext {
  platform?: Platform;
  appVersion?: string;
  buildNumber?: string;
  osVersion?: string;
  deviceModel?: string;
  locale?: string;
  timezone?: string;
  sdkVersion?: string;
  /** Last screen passed to `analytics.screen()`, attached so errors and events know where they happened. */
  screen?: string;
}

/** An event as it travels from the SDK to `POST /v1/batch`. */
export interface WireEvent {
  eventId: string;
  eventName: string;
  anonymousId: string;
  distinctId?: string;
  sessionId?: string;
  timestamp: number;
  properties?: EventProperties;
  context?: EventContext;
}

export interface BatchRequest {
  apiKey: string;
  /** Device clock when the request was sent; lets the server correct for device clock skew. */
  sentAt?: number;
  events: WireEvent[];
}

export type RejectionReason =
  | "invalid_event"
  | "invalid_event_name"
  | "reserved_event_name"
  | "invalid_id"
  | "invalid_properties"
  | "properties_too_large"
  | "invalid_context"
  | "timestamp_out_of_range"
  | "duplicate_in_batch";

export interface EventRejection {
  index: number;
  eventId?: string;
  reason: RejectionReason;
}

/**
 * A 2xx response means every event in the batch is settled: stored, already
 * stored (duplicate) or permanently rejected. Clients can drop the whole batch.
 */
export interface BatchResponse {
  accepted: number;
  duplicates: number;
  rejected: number;
  errors?: EventRejection[];
}

export type BatchErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "payload_too_large"
  | "too_many_events"
  | "invalid_api_key"
  | "project_disabled"
  | "internal_error";

export interface BatchErrorResponse {
  error: BatchErrorCode;
  message: string;
}
