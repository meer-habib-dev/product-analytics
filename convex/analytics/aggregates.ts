import { DAY_MS, INGESTION_LIMITS } from "@analytics/shared";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Counters are accumulated in memory for a whole batch and written once per
 * row at the end. This keeps writes per batch small and reduces OCC
 * contention on hot rows like "today's project stats".
 */

type ProjectDayCounters = {
  totalEvents: number;
  screenViews: number;
  sessions: number;
  sessionsWithErrors: number;
  activeUsers: number;
  newUsers: number;
  errorCount: number;
};
type EventDayCounters = { totalEvents: number; uniqueUsers: number };
type ReleaseDayCounters = {
  totalEvents: number;
  sessions: number;
  sessionsWithErrors: number;
  activeUsers: number;
  errorCount: number;
};

const emptyProjectDay = (): ProjectDayCounters => ({
  totalEvents: 0,
  screenViews: 0,
  sessions: 0,
  sessionsWithErrors: 0,
  activeUsers: 0,
  newUsers: 0,
  errorCount: 0,
});
const emptyReleaseDay = (): ReleaseDayCounters => ({
  totalEvents: 0,
  sessions: 0,
  sessionsWithErrors: 0,
  activeUsers: 0,
  errorCount: 0,
});

export interface ReleaseKey {
  platform: string;
  appVersion: string;
}

export class BatchAggregates {
  readonly projectDays = new Map<string, ProjectDayCounters>();
  readonly eventDays = new Map<string, { date: string; eventName: string; counters: EventDayCounters }>();
  readonly releaseDays = new Map<string, { date: string; release: ReleaseKey; counters: ReleaseDayCounters }>();
  readonly periods = new Map<string, number>();

  projectDay(date: string): ProjectDayCounters {
    let counters = this.projectDays.get(date);
    if (!counters) this.projectDays.set(date, (counters = emptyProjectDay()));
    return counters;
  }

  eventDay(date: string, eventName: string): EventDayCounters {
    const key = `${date}|${eventName}`;
    let entry = this.eventDays.get(key);
    if (!entry) this.eventDays.set(key, (entry = { date, eventName, counters: { totalEvents: 0, uniqueUsers: 0 } }));
    return entry.counters;
  }

  releaseDay(date: string, release: ReleaseKey): ReleaseDayCounters {
    const key = `${date}|${release.platform}|${release.appVersion}`;
    let entry = this.releaseDays.get(key);
    if (!entry) this.releaseDays.set(key, (entry = { date, release, counters: emptyReleaseDay() }));
    return entry.counters;
  }

  incrementPeriodActiveUsers(period: string): void {
    this.periods.set(period, (this.periods.get(period) ?? 0) + 1);
  }
}

export function releaseKey(context: { platform?: string; appVersion?: string }): ReleaseKey {
  return { platform: context.platform ?? "unknown", appVersion: context.appVersion ?? "unknown" };
}

export async function applyAggregates(ctx: MutationCtx, projectId: Id<"projects">, agg: BatchAggregates): Promise<void> {
  for (const [date, counters] of agg.projectDays) {
    const existing = await ctx.db
      .query("dailyProjectStats")
      .withIndex("by_project_date", (q) => q.eq("projectId", projectId).eq("date", date))
      .unique();
    if (existing) await ctx.db.patch(existing._id, addCounters(existing, counters));
    else await ctx.db.insert("dailyProjectStats", { projectId, date, ...counters });
  }

  for (const { date, eventName, counters } of agg.eventDays.values()) {
    const existing = await ctx.db
      .query("dailyEventStats")
      .withIndex("by_project_date_event", (q) => q.eq("projectId", projectId).eq("date", date).eq("eventName", eventName))
      .unique();
    if (existing) await ctx.db.patch(existing._id, addCounters(existing, counters));
    else await ctx.db.insert("dailyEventStats", { projectId, date, eventName, ...counters });
  }

  for (const { date, release, counters } of agg.releaseDays.values()) {
    const existing = await ctx.db
      .query("dailyReleaseStats")
      .withIndex("by_project_date_release", (q) =>
        q.eq("projectId", projectId).eq("date", date).eq("platform", release.platform).eq("appVersion", release.appVersion),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, addCounters(existing, counters));
    else await ctx.db.insert("dailyReleaseStats", { projectId, date, ...release, ...counters });
  }

  for (const [period, activeUsers] of agg.periods) {
    const existing = await ctx.db
      .query("periodActiveUsers")
      .withIndex("by_project_period", (q) => q.eq("projectId", projectId).eq("period", period))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { activeUsers: existing.activeUsers + activeUsers });
    else await ctx.db.insert("periodActiveUsers", { projectId, period, activeUsers });
  }
}

function addCounters<T extends Record<string, number>>(existing: object, delta: T): T {
  const current = existing as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(delta)) {
    const previous = current[key];
    result[key] = (typeof previous === "number" ? previous : 0) + value;
  }
  return result as T;
}

/** Bucket lengths used to compute when a marker can no longer be needed. */
export const BUCKET_LENGTH_MS = { day: DAY_MS, week: 7 * DAY_MS, month: 31 * DAY_MS } as const;

/**
 * Returns true exactly once per (bucket, scope, person). This is what makes
 * "unique users" counters correct instead of counting events.
 */
export class UniqueMarkers {
  private readonly seen = new Set<string>();

  constructor(
    private readonly ctx: MutationCtx,
    private readonly projectId: Id<"projects">,
  ) {}

  async firstSeen(args: {
    bucket: string;
    scope: string;
    personId: Id<"people">;
    timestamp: number;
    bucketLengthMs: number;
  }): Promise<boolean> {
    const cacheKey = `${args.bucket}|${args.scope}|${args.personId}`;
    if (this.seen.has(cacheKey)) return false;
    this.seen.add(cacheKey);

    const existing = await this.ctx.db
      .query("uniqueMarkers")
      .withIndex("by_key", (q) =>
        q.eq("projectId", this.projectId).eq("bucket", args.bucket).eq("scope", args.scope).eq("personId", args.personId),
      )
      .unique();
    if (existing) return false;

    await this.ctx.db.insert("uniqueMarkers", {
      projectId: this.projectId,
      bucket: args.bucket,
      scope: args.scope,
      personId: args.personId,
      // The latest event that can still land in this bucket is bucket end + max event age.
      expiresAt: args.timestamp + args.bucketLengthMs + INGESTION_LIMITS.maxEventAgeMs + DAY_MS,
    });
    return true;
  }
}
