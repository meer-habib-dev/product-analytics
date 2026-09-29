import { daysBetween } from "@analytics/shared";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireProjectAccess } from "../lib/authz";
import { dateRange, type DateRange, normalizeRange, rangeToTimestamps } from "../lib/ranges";

/** Upper bound on aggregate rows read by one query; keeps queries inside Convex read limits. */
const MAX_AGGREGATE_ROWS = 8000;
/** Property breakdowns sample the most recent raw events instead of scanning full history. */
const BREAKDOWN_SAMPLE_SIZE = 3000;

async function eventSeries(ctx: QueryCtx, projectId: Id<"projects">, eventName: string, range: DateRange) {
  const rows = await ctx.db
    .query("dailyEventStats")
    .withIndex("by_project_event_date", (q) =>
      q.eq("projectId", projectId).eq("eventName", eventName).gte("date", range.from).lte("date", range.to),
    )
    .collect();
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return daysBetween(range.from, range.to).map((date) => ({
    date,
    totalEvents: byDate.get(date)?.totalEvents ?? 0,
    uniqueUsers: byDate.get(date)?.uniqueUsers ?? 0,
  }));
}

export const listEventDefinitions = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectAccess(ctx, projectId);
    const defs = await ctx.db
      .query("eventDefinitions")
      .withIndex("by_project_name", (q) => q.eq("projectId", projectId))
      .take(1000);
    return defs.map((d) => ({ eventName: d.eventName, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt }));
  },
});

export const getTopEvents = query({
  args: { projectId: v.id("projects"), range: dateRange, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const range = normalizeRange(args.range);
    const rows = await ctx.db
      .query("dailyEventStats")
      .withIndex("by_project_date_event", (q) =>
        q.eq("projectId", args.projectId).gte("date", range.from).lte("date", range.to),
      )
      .take(MAX_AGGREGATE_ROWS);

    const totals = new Map<string, { totalEvents: number; userDays: number }>();
    for (const row of rows) {
      const entry = totals.get(row.eventName) ?? { totalEvents: 0, userDays: 0 };
      entry.totalEvents += row.totalEvents;
      entry.userDays += row.uniqueUsers;
      totals.set(row.eventName, entry);
    }
    const days = daysBetween(range.from, range.to).length;
    const events = [...totals.entries()]
      .map(([eventName, t]) => ({ eventName, totalEvents: t.totalEvents, avgDailyUsers: Math.round((t.userDays / days) * 10) / 10 }))
      .sort((a, b) => b.totalEvents - a.totalEvents);
    return {
      events: events.slice(0, Math.min(args.limit ?? 50, 200)),
      truncated: rows.length === MAX_AGGREGATE_ROWS,
    };
  },
});

export const getEventTrend = query({
  args: {
    projectId: v.id("projects"),
    eventNames: v.array(v.string()),
    range: dateRange,
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const range = normalizeRange(args.range);
    const names = [...new Set(args.eventNames)].slice(0, 10);
    const series = await Promise.all(names.map((name) => eventSeries(ctx, args.projectId, name, range)));
    return {
      range,
      eventNames: names,
      points: daysBetween(range.from, range.to).map((date, i) => ({
        date,
        values: Object.fromEntries(
          names.map((name, j) => [name, { total: series[j]![i]!.totalEvents, unique: series[j]![i]!.uniqueUsers }]),
        ),
      })),
    };
  },
});

export const getEventDetails = query({
  args: { projectId: v.id("projects"), eventName: v.string(), range: dateRange },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const range = normalizeRange(args.range);
    const definition = await ctx.db
      .query("eventDefinitions")
      .withIndex("by_project_name", (q) => q.eq("projectId", args.projectId).eq("eventName", args.eventName))
      .unique();
    if (!definition) return null;

    const series = await eventSeries(ctx, args.projectId, args.eventName, range);
    const recent = await ctx.db
      .query("events")
      .withIndex("by_project_name_time", (q) => q.eq("projectId", args.projectId).eq("eventName", args.eventName))
      .order("desc")
      .take(25);
    const propertyKeys = new Set<string>();
    for (const e of recent) Object.keys(e.properties).forEach((k) => propertyKeys.add(k));

    return {
      eventName: definition.eventName,
      firstSeenAt: definition.firstSeenAt,
      lastSeenAt: definition.lastSeenAt,
      totalEvents: series.reduce((a, d) => a + d.totalEvents, 0),
      series,
      recent,
      propertyKeys: [...propertyKeys].sort(),
    };
  },
});

/**
 * Counts values of one property (or context field) over the most recent
 * events in range. Sampled by design: exact counts over millions of raw
 * events don't belong in an interactive query.
 */
export const getEventPropertyBreakdown = query({
  args: {
    projectId: v.id("projects"),
    eventName: v.string(),
    property: v.string(),
    range: dateRange,
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const { start, end } = rangeToTimestamps(normalizeRange(args.range));
    const events = await ctx.db
      .query("events")
      .withIndex("by_project_name_time", (q) =>
        q.eq("projectId", args.projectId).eq("eventName", args.eventName).gte("timestamp", start).lte("timestamp", end),
      )
      .order("desc")
      .take(BREAKDOWN_SAMPLE_SIZE);

    const readValue = propertyReader(args.property);
    const counts = new Map<string, { count: number; people: Set<string> }>();
    for (const event of events) {
      const value = readValue(event);
      const entry = counts.get(value) ?? { count: 0, people: new Set<string>() };
      entry.count++;
      entry.people.add(event.personId);
      counts.set(value, entry);
    }
    const values = [...counts.entries()]
      .map(([value, c]) => ({ value, count: c.count, uniqueUsers: c.people.size }))
      .sort((a, b) => b.count - a.count);

    return {
      property: args.property,
      sampleSize: events.length,
      sampled: events.length === BREAKDOWN_SAMPLE_SIZE,
      values: values.slice(0, 25),
      otherCount: values.slice(25).reduce((a, v) => a + v.count, 0),
    };
  },
});

type BreakdownEvent = { properties: Record<string, unknown>; context: Record<string, unknown> };

/** `context.appVersion` style keys read from context; everything else from properties. */
function propertyReader(property: string): (event: BreakdownEvent) => string {
  const [source, key] = property.startsWith("context.") ? (["context", property.slice(8)] as const) : (["properties", property] as const);
  return (event) => {
    const value = event[source][key];
    return value === undefined || value === null ? "(none)" : String(value);
  };
}
