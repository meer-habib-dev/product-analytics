import { INGESTION_LIMITS, RESERVED_EVENT_NAMES } from "./constants";

const CUSTOM_EVENT_NAME = /^[A-Za-z][A-Za-z0-9_ .:\-/]*$/;
const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
/** Keys must also be valid Convex field names, which rules out `$`/`_` prefixes. */
const PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;
const IDENTIFIER = /^[\x21-\x7E]+$/;

export type EventNameCheck = { ok: true } | { ok: false; reason: "invalid_event_name" | "reserved_event_name" };

export function checkEventName(name: string): EventNameCheck {
  if (name.length === 0 || name.length > INGESTION_LIMITS.maxEventNameLength) {
    return { ok: false, reason: "invalid_event_name" };
  }
  if (name.startsWith("$")) {
    return RESERVED_EVENT_NAMES.has(name) ? { ok: true } : { ok: false, reason: "reserved_event_name" };
  }
  return CUSTOM_EVENT_NAME.test(name) ? { ok: true } : { ok: false, reason: "invalid_event_name" };
}

/** The documented convention (`object_action`). Not enforced by ingestion; the SDK warns in debug mode. */
export function isConventionalEventName(name: string): boolean {
  return name.startsWith("$") || SNAKE_CASE.test(name);
}

export function isValidPropertyKey(key: string): boolean {
  return key.length <= INGESTION_LIMITS.maxPropertyKeyLength && PROPERTY_KEY.test(key);
}

/** Turns arbitrary keys like "Plan Type" or "1st-screen" into storable keys ("Plan_Type", "p_1st_screen"). */
export function normalizePropertyKey(key: string): string | null {
  let normalized = key.trim().replace(/[^A-Za-z0-9_]/g, "_");
  if (normalized.length === 0) return null;
  if (!/^[A-Za-z]/.test(normalized)) normalized = `p_${normalized.replace(/^_+/, "")}`;
  normalized = normalized.slice(0, INGESTION_LIMITS.maxPropertyKeyLength);
  return isValidPropertyKey(normalized) ? normalized : null;
}

/** IDs (event, anonymous, distinct, session) are opaque printable ASCII strings without whitespace. */
export function isValidIdentifier(id: string): boolean {
  return id.length > 0 && id.length <= INGESTION_LIMITS.maxIdLength && IDENTIFIER.test(id);
}
