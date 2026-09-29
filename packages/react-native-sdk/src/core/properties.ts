import { INGESTION_LIMITS, normalizePropertyKey, type EventProperties, type PropertyValue } from "@analytics/shared";
import type { Logger, PropertiesInput } from "./types";

/**
 * Coerces arbitrary developer input into what ingestion accepts (flat
 * primitives, safe keys, bounded sizes) so events are never rejected
 * server-side for fixable reasons.
 */
export function sanitizeProperties(input: PropertiesInput | undefined, logger: Logger, maxStringLength: number = INGESTION_LIMITS.maxStringValueLength): EventProperties {
  const result: EventProperties = {};
  if (!input) return result;

  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (count >= INGESTION_LIMITS.maxProperties) {
      logger.warn(`Dropping properties beyond the first ${INGESTION_LIMITS.maxProperties}.`);
      break;
    }
    const key = normalizePropertyKey(rawKey);
    if (!key) {
      logger.warn(`Dropping property with unusable key "${rawKey}".`);
      continue;
    }
    if (key !== rawKey) logger.debug(`Property key "${rawKey}" normalized to "${key}".`);
    const value = sanitizeValue(rawValue, maxStringLength);
    if (value === undefined) continue;
    result[key] = value;
    count++;
  }

  while (JSON.stringify(result).length > INGESTION_LIMITS.maxPropertiesBytes) {
    const largest = Object.entries(result).sort((a, b) => String(b[1]).length - String(a[1]).length)[0];
    if (!largest) break;
    logger.warn(`Dropping property "${largest[0]}" to stay under the payload limit.`);
    delete result[largest[0]];
  }
  return result;
}

function sanitizeValue(value: unknown, maxStringLength: number): PropertyValue | undefined {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
      return truncate(value, maxStringLength);
    case "number":
      return Number.isFinite(value) ? value : undefined;
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "object": {
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
      try {
        return truncate(JSON.stringify(value), maxStringLength);
      } catch {
        return undefined;
      }
    }
    default:
      return undefined;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
