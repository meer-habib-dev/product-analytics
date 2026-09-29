import { INGESTION_LIMITS } from "@analytics/shared";
import type { PropertiesInput } from "./types";

/** Converts anything thrown into `$error` properties. Arbitrary objects are stringified, never traversed. */
export function errorToProperties(error: unknown, fatal: boolean): PropertiesInput {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message,
      stack: typeof error.stack === "string" ? error.stack.slice(0, INGESTION_LIMITS.maxStackLength) : undefined,
      fatal,
    };
  }
  if (typeof error === "string") return { name: "Error", message: error, fatal };
  let message: string;
  try {
    message = JSON.stringify(error) ?? String(error);
  } catch {
    message = String(error);
  }
  return { name: "NonError", message, fatal };
}
