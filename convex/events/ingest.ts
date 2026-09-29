import { isoWeek, RESERVED_EVENTS, utcDay, utcMonth } from "@analytics/shared";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { applyAggregates, BatchAggregates, BUCKET_LENGTH_MS, releaseKey, UniqueMarkers } from "../analytics/aggregates";
import { recordErrorOccurrence } from "../errors/grouping";
import { validatedEvent, type ValidatedEventValue } from "../lib/validators";
import { IdentityResolver, PersonUpdates } from "../people/identity";
import { SessionTracker } from "../sessions/tracking";

/** Bookkeeping writes that don't need to be fresh to the millisecond are throttled to avoid write contention. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Stores one validated batch: dedupe → resolve identity → insert → update
 * lightweight aggregates. Runs as a single transaction, so a retried batch
 * either fully applied before or applies now; never half.
 * Nothing here scans history: every read is a point lookup on an index.
 */
export const ingestBatch = internalMutation({
  args: {
    projectId: v.id("projects"),
    apiKeyId: v.id("projectApiKeys"),
    receivedAt: v.number(),
    events: v.array(validatedEvent),
  },
  handler: async (ctx, args) => {
    const { projectId, receivedAt } = args;
    const identity = new IdentityResolver(ctx, projectId);
    const personUpdates = new PersonUpdates();
    const sessions = new SessionTracker(ctx, projectId);
    const aggregates = new BatchAggregates();
    const markers = new UniqueMarkers(ctx, projectId);
    const eventNames = new Map<string, number>();

    let accepted = 0;
    let duplicates = 0;

    // Timestamp order makes identity promotion and session entry screens deterministic.
    const events = [...args.events].sort((a, b) => a.timestamp - b.timestamp);

    for (const event of events) {
      if (await isDuplicate(ctx, projectId, event.eventId)) {
        duplicates++;
        continue;
      }

      const { personId, isNew } = await identity.resolve(event);
      personUpdates.touch(personId, event.timestamp, event.context);
      if (event.eventName === RESERVED_EVENTS.identify) personUpdates.setTraits(personId, event.properties);

      const errorGroupId =
        event.eventName === RESERVED_EVENTS.error ? await recordErrorOccurrence(ctx, projectId, event, personId) : undefined;

      await ctx.db.insert("events", {
        projectId,
        eventId: event.eventId,
        eventName: event.eventName,
        personId,
        anonymousId: event.anonymousId,
        distinctId: event.distinctId,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        receivedAt,
        properties: event.properties,
        context: event.context,
        errorGroupId,
      });

      await sessions.record(event, personId);
      await countEvent(event, personId, isNew, aggregates, markers);
      eventNames.set(event.eventName, Math.max(eventNames.get(event.eventName) ?? 0, event.timestamp));
      accepted++;
    }

    if (accepted > 0) {
      await personUpdates.apply(ctx);
      await sessions.apply(aggregates);
      await applyAggregates(ctx, projectId, aggregates);
      await upsertEventDefinitions(ctx, projectId, eventNames);
      await touchProjectAndKey(ctx, projectId, args.apiKeyId, receivedAt);
    }

    return { accepted, duplicates };
  },
});

async function isDuplicate(ctx: MutationCtx, projectId: Id<"projects">, eventId: string): Promise<boolean> {
  const existing = await ctx.db
    .query("events")
    .withIndex("by_project_event_id", (q) => q.eq("projectId", projectId).eq("eventId", eventId))
    .first();
  return existing !== null;
}

async function countEvent(
  event: ValidatedEventValue,
  personId: Id<"people">,
  isNewPerson: boolean,
  agg: BatchAggregates,
  markers: UniqueMarkers,
): Promise<void> {
  const date = utcDay(event.timestamp);
  const release = releaseKey(event.context);
  const isError = event.eventName === RESERVED_EVENTS.error;
  const projectDay = agg.projectDay(date);
  const releaseDay = agg.releaseDay(date, release);
  const eventDay = agg.eventDay(date, event.eventName);
  const marker = { personId, timestamp: event.timestamp };

  projectDay.totalEvents += 1;
  releaseDay.totalEvents += 1;
  eventDay.totalEvents += 1;
  if (event.eventName === RESERVED_EVENTS.screen) projectDay.screenViews += 1;
  if (isError) {
    projectDay.errorCount += 1;
    releaseDay.errorCount += 1;
  }
  if (isNewPerson) projectDay.newUsers += 1;

  // Session lifecycle events aren't user activity, so they don't make a user "active".
  if (event.eventName === RESERVED_EVENTS.sessionEnd) return;

  if (await markers.firstSeen({ ...marker, bucket: date, scope: "active", bucketLengthMs: BUCKET_LENGTH_MS.day })) {
    projectDay.activeUsers += 1;
    const week = isoWeek(event.timestamp);
    if (await markers.firstSeen({ ...marker, bucket: week, scope: "active", bucketLengthMs: BUCKET_LENGTH_MS.week })) {
      agg.incrementPeriodActiveUsers(week);
    }
    const month = utcMonth(event.timestamp);
    if (await markers.firstSeen({ ...marker, bucket: month, scope: "active", bucketLengthMs: BUCKET_LENGTH_MS.month })) {
      agg.incrementPeriodActiveUsers(month);
    }
  }
  if (await markers.firstSeen({ ...marker, bucket: date, scope: `event:${event.eventName}`, bucketLengthMs: BUCKET_LENGTH_MS.day })) {
    eventDay.uniqueUsers += 1;
  }
  const releaseScope = `release:${release.platform}:${release.appVersion}`;
  if (await markers.firstSeen({ ...marker, bucket: date, scope: releaseScope, bucketLengthMs: BUCKET_LENGTH_MS.day })) {
    releaseDay.activeUsers += 1;
  }
}

async function upsertEventDefinitions(ctx: MutationCtx, projectId: Id<"projects">, eventNames: Map<string, number>) {
  for (const [eventName, lastSeenAt] of eventNames) {
    const existing = await ctx.db
      .query("eventDefinitions")
      .withIndex("by_project_name", (q) => q.eq("projectId", projectId).eq("eventName", eventName))
      .unique();
    if (!existing) {
      await ctx.db.insert("eventDefinitions", { projectId, eventName, firstSeenAt: lastSeenAt, lastSeenAt });
    } else if (lastSeenAt - existing.lastSeenAt > TOUCH_INTERVAL_MS) {
      await ctx.db.patch(existing._id, { lastSeenAt });
    }
  }
}

async function touchProjectAndKey(ctx: MutationCtx, projectId: Id<"projects">, apiKeyId: Id<"projectApiKeys">, now: number) {
  const project = await ctx.db.get(projectId);
  if (project && project.firstEventAt === undefined) await ctx.db.patch(projectId, { firstEventAt: now });
  const key = await ctx.db.get(apiKeyId);
  if (key && now - (key.lastUsedAt ?? 0) > TOUCH_INTERVAL_MS) await ctx.db.patch(apiKeyId, { lastUsedAt: now });
}
