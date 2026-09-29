import { checkEventName, isConventionalEventName, type EventProperties } from "@analytics/shared";
import type { IdentityManager } from "./identity";
import { uuid } from "./uuid";
import type { EventContext, Logger, WireEvent } from "./types";

/**
 * Builds wire events: assigns the idempotency key (eventId) before the
 * event ever reaches the queue, and stamps identity, session and context.
 */
export class EventFactory {
  private currentScreen: string | undefined;

  constructor(
    private readonly identity: IdentityManager,
    private readonly getSessionId: () => string | undefined,
    private readonly context: EventContext,
    private readonly logger: Logger,
  ) {}

  setScreen(name: string): void {
    this.currentScreen = name;
  }

  get screen(): string | undefined {
    return this.currentScreen;
  }

  /** Returns null (and logs in debug mode) for names ingestion would reject. */
  create(eventName: string, properties: EventProperties, timestamp: number): WireEvent | null {
    const name = eventName.trim();
    const check = checkEventName(name);
    if (!check.ok) {
      this.logger.warn(`Ignoring event "${eventName}": ${check.reason}.`);
      return null;
    }
    if (!isConventionalEventName(name)) {
      this.logger.debug(`Event "${name}" doesn't follow the snake_case object_action convention.`);
    }

    return {
      eventId: uuid(),
      eventName: name,
      anonymousId: this.identity.anonymousId,
      distinctId: this.identity.distinctId,
      sessionId: this.getSessionId(),
      timestamp,
      properties,
      context: this.currentScreen ? { ...this.context, screen: this.currentScreen } : this.context,
    };
  }
}
