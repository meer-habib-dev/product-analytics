import { z } from "zod";
import { INGESTION_LIMITS, PLATFORMS, RESERVED_EVENTS, type Platform } from "./constants";
import { checkEventName, isValidIdentifier, isValidPropertyKey } from "./naming";
import type { EventContext, EventProperties, EventRejection, PropertyValue, RejectionReason } from "./protocol";

/**
 * Server-side validation for `POST /v1/batch`. Payloads are never trusted just
 * because our SDK produced them: every field is checked and normalized here.
 */

const envelopeSchema = z.object({
  apiKey: z.string().min(1).max(200),
  sentAt: z.number().finite().optional(),
  events: z.array(z.unknown()),
});

const eventShapeSchema = z.object({
  eventId: z.string(),
  eventName: z.string(),
  anonymousId: z.string(),
  distinctId: z.string().nullish(),
  sessionId: z.string().nullish(),
  timestamp: z.number().finite(),
  properties: z.record(z.string(), z.unknown()).nullish(),
  context: z.record(z.string(), z.unknown()).nullish(),
});

export interface ValidatedEvent {
  eventId: string;
  eventName: string;
  anonymousId: string;
  distinctId?: string;
  sessionId?: string;
  timestamp: number;
  properties: EventProperties;
  context: EventContext;
}

export type EnvelopeResult =
  | { ok: true; apiKey: string; sentAt?: number; events: unknown[] }
  | { ok: false; error: "invalid_request" | "too_many_events"; message: string };

export function parseEnvelope(body: unknown): EnvelopeResult {
  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "invalid_request", message: "Expected { apiKey, events[] }." };
  }
  if (parsed.data.events.length > INGESTION_LIMITS.maxEventsPerBatch) {
    return {
      ok: false,
      error: "too_many_events",
      message: `A batch may contain at most ${INGESTION_LIMITS.maxEventsPerBatch} events.`,
    };
  }
  return { ok: true, ...parsed.data };
}

export interface BatchValidation {
  events: ValidatedEvent[];
  rejections: EventRejection[];
}

export function validateEvents(rawEvents: unknown[], options: { receivedAt: number; sentAt?: number }): BatchValidation {
  const clockOffset = computeClockOffset(options.receivedAt, options.sentAt);
  const events: ValidatedEvent[] = [];
  const rejections: EventRejection[] = [];
  const seen = new Set<string>();

  rawEvents.forEach((raw, index) => {
    const result = validateEvent(raw, options.receivedAt, clockOffset);
    if (!result.ok) {
      rejections.push({ index, eventId: result.eventId, reason: result.reason });
      return;
    }
    if (seen.has(result.event.eventId)) {
      rejections.push({ index, eventId: result.event.eventId, reason: "duplicate_in_batch" });
      return;
    }
    seen.add(result.event.eventId);
    events.push(result.event);
  });

  return { events, rejections };
}

/** Device clocks are often wrong; `sentAt` lets us shift event times onto the server clock. */
function computeClockOffset(receivedAt: number, sentAt: number | undefined): number {
  if (sentAt === undefined || !Number.isFinite(sentAt) || sentAt <= 0) return 0;
  return receivedAt - sentAt;
}

type EventResult =
  | { ok: true; event: ValidatedEvent }
  | { ok: false; reason: RejectionReason; eventId?: string };

export function validateEvent(raw: unknown, receivedAt: number, clockOffset = 0): EventResult {
  const parsed = eventShapeSchema.safeParse(raw);
  if (!parsed.success) {
    const eventId = typeof (raw as { eventId?: unknown })?.eventId === "string" ? (raw as { eventId: string }).eventId : undefined;
    return { ok: false, reason: "invalid_event", eventId: eventId?.slice(0, INGESTION_LIMITS.maxIdLength) };
  }
  const input = parsed.data;
  const eventId = input.eventId;

  if (!isValidIdentifier(eventId)) return { ok: false, reason: "invalid_id" };

  const eventName = input.eventName.trim();
  const nameCheck = checkEventName(eventName);
  if (!nameCheck.ok) return { ok: false, reason: nameCheck.reason, eventId };

  const ids = [input.anonymousId, input.distinctId, input.sessionId].filter((id): id is string => id != null);
  if (!ids.every(isValidIdentifier)) return { ok: false, reason: "invalid_id", eventId };

  const timestamp = Math.round(input.timestamp + clockOffset);
  if (timestamp < receivedAt - INGESTION_LIMITS.maxEventAgeMs || timestamp > receivedAt + INGESTION_LIMITS.maxFutureSkewMs) {
    return { ok: false, reason: "timestamp_out_of_range", eventId };
  }

  const properties = normalizeProperties(input.properties ?? {}, eventName);
  if (!properties.ok) return { ok: false, reason: properties.reason, eventId };

  const context = normalizeContext(input.context ?? {});
  if (!context.ok) return { ok: false, reason: "invalid_context", eventId };

  return {
    ok: true,
    event: {
      eventId,
      eventName,
      anonymousId: input.anonymousId,
      distinctId: input.distinctId ?? undefined,
      sessionId: input.sessionId ?? undefined,
      timestamp,
      properties: properties.value,
      context: context.value,
    },
  };
}

type PropertiesResult = { ok: true; value: EventProperties } | { ok: false; reason: "invalid_properties" | "properties_too_large" };

export function normalizeProperties(input: Record<string, unknown>, eventName: string): PropertiesResult {
  const entries = Object.entries(input);
  if (entries.length > INGESTION_LIMITS.maxProperties) return { ok: false, reason: "properties_too_large" };

  const value: EventProperties = {};
  for (const [key, raw] of entries) {
    if (!isValidPropertyKey(key)) return { ok: false, reason: "invalid_properties" };
    if (raw === undefined) continue;
    const maxLength =
      eventName === RESERVED_EVENTS.error && key === "stack" ? INGESTION_LIMITS.maxStackLength : INGESTION_LIMITS.maxStringValueLength;
    const normalized = normalizePropertyValue(raw, maxLength);
    if (normalized === INVALID) return { ok: false, reason: "invalid_properties" };
    value[key] = normalized;
  }

  if (JSON.stringify(value).length > INGESTION_LIMITS.maxPropertiesBytes) return { ok: false, reason: "properties_too_large" };
  return { ok: true, value };
}

const INVALID = Symbol("invalid");

function normalizePropertyValue(raw: unknown, maxStringLength: number): PropertyValue | typeof INVALID {
  if (raw === null || typeof raw === "boolean") return raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : INVALID;
  if (typeof raw === "string") return raw.length > maxStringLength ? raw.slice(0, maxStringLength) : raw;
  return INVALID;
}

const CONTEXT_KEYS = ["appVersion", "buildNumber", "osVersion", "deviceModel", "locale", "timezone", "sdkVersion", "screen"] as const;

type ContextResult = { ok: true; value: EventContext } | { ok: false };

/** Unknown context keys are dropped rather than rejected so newer SDKs keep working against older servers. */
export function normalizeContext(input: Record<string, unknown>): ContextResult {
  const value: EventContext = {};
  if (input.platform != null) {
    if (typeof input.platform !== "string") return { ok: false };
    const platform = input.platform.toLowerCase();
    value.platform = (PLATFORMS as readonly string[]).includes(platform) ? (platform as Platform) : "other";
  }
  for (const key of CONTEXT_KEYS) {
    const raw = input[key];
    if (raw == null) continue;
    if (typeof raw !== "string" && typeof raw !== "number") return { ok: false };
    const str = String(raw).trim().slice(0, INGESTION_LIMITS.maxContextValueLength);
    if (str.length > 0) value[key] = str;
  }
  return { ok: true, value };
}
