import { RESERVED_EVENTS, utcDay } from "@analytics/shared";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { type BatchAggregates, releaseKey } from "../analytics/aggregates";
import type { ValidatedEventValue } from "../lib/validators";

type SessionState = Omit<Doc<"sessions">, "_id" | "_creationTime">;

/**
 * Builds session rows from the events themselves. A session's end is its last
 * event (optionally refined by `$session_end`), so apps killed without a
 * clean shutdown still produce correct durations.
 */
export class SessionTracker {
  private readonly states = new Map<string, { existing: Doc<"sessions"> | null; next: SessionState }>();

  constructor(
    private readonly ctx: MutationCtx,
    private readonly projectId: Id<"projects">,
  ) {}

  async record(event: ValidatedEventValue, personId: Id<"people">): Promise<void> {
    if (!event.sessionId) return;
    let state = this.states.get(event.sessionId);
    if (!state) {
      const existing = await this.ctx.db
        .query("sessions")
        .withIndex("by_project_session", (q) => q.eq("projectId", this.projectId).eq("sessionId", event.sessionId!))
        .unique();
      state = { existing, next: existing ? stripSystemFields(existing) : this.emptySession(event, personId) };
      this.states.set(event.sessionId, state);
    }
    applyEvent(state.next, event, personId);
  }

  async apply(agg: BatchAggregates): Promise<void> {
    for (const { existing, next } of this.states.values()) {
      const date = utcDay(next.startedAt);
      const release = releaseKey({ platform: next.platform, appVersion: next.appVersion });
      if (!existing) {
        agg.projectDay(date).sessions += 1;
        agg.releaseDay(date, release).sessions += 1;
      }
      if ((existing?.errorCount ?? 0) === 0 && next.errorCount > 0) {
        agg.projectDay(date).sessionsWithErrors += 1;
        agg.releaseDay(date, release).sessionsWithErrors += 1;
      }
      if (existing) await this.ctx.db.patch(existing._id, next);
      else await this.ctx.db.insert("sessions", next);
    }
  }

  private emptySession(event: ValidatedEventValue, personId: Id<"people">): SessionState {
    return {
      projectId: this.projectId,
      sessionId: event.sessionId!,
      personId,
      anonymousId: event.anonymousId,
      startedAt: event.timestamp,
      lastEventAt: event.timestamp,
      eventCount: 0,
      screenCount: 0,
      errorCount: 0,
      platform: event.context.platform,
      appVersion: event.context.appVersion,
    };
  }
}

function applyEvent(session: SessionState, event: ValidatedEventValue, personId: Id<"people">): void {
  session.eventCount += 1;
  session.personId = personId;
  if (event.distinctId) session.distinctId = event.distinctId;
  if (event.timestamp < session.startedAt) session.startedAt = event.timestamp;
  if (event.timestamp > session.lastEventAt) session.lastEventAt = event.timestamp;
  session.platform ??= event.context.platform;
  session.appVersion ??= event.context.appVersion;

  if (event.eventName === RESERVED_EVENTS.screen) {
    session.screenCount += 1;
    const name = event.properties.name;
    // Batches are processed in timestamp order, so the first screen seen is the entry screen.
    if (typeof name === "string") session.entryScreen ??= name;
  }
  if (event.eventName === RESERVED_EVENTS.error) session.errorCount += 1;
  if (event.eventName === RESERVED_EVENTS.sessionEnd) {
    session.endedAt = Math.max(session.endedAt ?? 0, event.timestamp);
  }
}

function stripSystemFields(doc: Doc<"sessions">): SessionState {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
}
