import { daysBetween, isoWeek, utcMonth, dayToTimestamp } from "@analytics/shared";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireProjectAccess } from "../lib/authz";
import { dateRange, type DateRange, normalizeRange, previousRange } from "../lib/ranges";

type DailyStats = Pick<
  Doc<"dailyProjectStats">,
  "totalEvents" | "screenViews" | "sessions" | "sessionsWithErrors" | "activeUsers" | "newUsers" | "errorCount"
>;

const ZERO: DailyStats = {
  totalEvents: 0,
  screenViews: 0,
  sessions: 0,
  sessionsWithErrors: 0,
  activeUsers: 0,
  newUsers: 0,
  errorCount: 0,
};

async function loadDailyStats(ctx: QueryCtx, projectId: Id<"projects">, range: DateRange) {
  const rows = await ctx.db
    .query("dailyProjectStats")
    .withIndex("by_project_date", (q) => q.eq("projectId", projectId).gte("date", range.from).lte("date", range.to))
    .collect();
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return daysBetween(range.from, range.to).map((date) => {
    const row = byDate.get(date);
    return { date, ...(row ? pickStats(row) : ZERO) };
  });
}

function pickStats(row: DailyStats): DailyStats {
  const { totalEvents, screenViews, sessions, sessionsWithErrors, activeUsers, newUsers, errorCount } = row;
  return { totalEvents, screenViews, sessions, sessionsWithErrors, activeUsers, newUsers, errorCount };
}

function summarize(series: Array<DailyStats>) {
  const sum = (key: keyof DailyStats) => series.reduce((acc, d) => acc + d[key], 0);
  const sessions = sum("sessions");
  const sessionsWithErrors = sum("sessionsWithErrors");
  return {
    events: sum("totalEvents"),
    screenViews: sum("screenViews"),
    sessions,
    newUsers: sum("newUsers"),
    errors: sum("errorCount"),
    // Summing daily uniques would count returning users many times, so the range metric is an average.
    avgDailyActiveUsers: series.length ? Math.round(sum("activeUsers") / series.length) : 0,
    errorFreeSessionRate: sessions > 0 ? 1 - sessionsWithErrors / sessions : null,
  };
}

async function periodActiveUsers(ctx: QueryCtx, projectId: Id<"projects">, period: string) {
  const row = await ctx.db
    .query("periodActiveUsers")
    .withIndex("by_project_period", (q) => q.eq("projectId", projectId).eq("period", period))
    .unique();
  return row?.activeUsers ?? 0;
}

/** Overview cards and charts. Reads only daily aggregates: cost is O(days), independent of event volume. */
export const getOverviewMetrics = query({
  args: { projectId: v.id("projects"), range: dateRange },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const range = normalizeRange(args.range);
    const previous = previousRange(range);

    const [series, previousSeries] = await Promise.all([
      loadDailyStats(ctx, args.projectId, range),
      loadDailyStats(ctx, args.projectId, previous),
    ]);
    const endTimestamp = dayToTimestamp(range.to);
    const [weekly, monthly] = await Promise.all([
      periodActiveUsers(ctx, args.projectId, isoWeek(endTimestamp)),
      periodActiveUsers(ctx, args.projectId, utcMonth(endTimestamp)),
    ]);

    return {
      range,
      totals: summarize(series),
      previousTotals: summarize(previousSeries),
      activeUsers: {
        daily: series.at(-1)?.activeUsers ?? 0,
        weekly,
        monthly,
        week: isoWeek(endTimestamp),
        month: utcMonth(endTimestamp),
      },
      series,
    };
  },
});
