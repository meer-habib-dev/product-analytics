import type { Logger } from "./types";

/** Analytics must stay silent in production; everything is logged only in debug mode. */
export function createLogger(enabled: () => boolean): Logger {
  return {
    debug(message, ...details) {
      if (enabled()) console.log(`[analytics] ${message}`, ...details);
    },
    warn(message, ...details) {
      if (enabled()) console.warn(`[analytics] ${message}`, ...details);
    },
  };
}
