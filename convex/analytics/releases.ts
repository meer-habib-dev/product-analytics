import { compareVersionsDesc } from "@analytics/shared";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireProjectAccess } from "../lib/authz";
import { dateRange, normalizeRange } from "../lib/ranges";

const MAX_ROWS = 8000;

/**
 * Per-release health for "did this release make things better or worse?":
 * activity, sessions, errors and error-free session rate per platform + version.
 */
export const getReleases = query({
  args: { projectId: v.id("projects"), range: dateRange },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const range = normalizeRange(args.range);
    const rows = await ctx.db
      .query("dailyReleaseStats")
      .withIndex("by_project_date_release", (q) =>
        q.eq("projectId", args.projectId).gte("date", range.from).lte("date", range.to),
      )
      .take(MAX_ROWS);

    const releases = new Map<
      string,
      {
        platform: string;
        appVersion: string;
        firstDate: string;
        lastDate: string;
        totalEvents: number;
        sessions: number;
        sessionsWithErrors: number;
        errorCount: number;
        userDays: number;
        activeDays: number;
      }
    >();
    for (const row of rows) {
      const key = `${row.platform}|${row.appVersion}`;
      const r = releases.get(key) ?? {
        platform: row.platform,
        appVersion: row.appVersion,
        firstDate: row.date,
        lastDate: row.date,
        totalEvents: 0,
        sessions: 0,
        sessionsWithErrors: 0,
        errorCount: 0,
        userDays: 0,
        activeDays: 0,
      };
      r.firstDate = row.date < r.firstDate ? row.date : r.firstDate;
      r.lastDate = row.date > r.lastDate ? row.date : r.lastDate;
      r.totalEvents += row.totalEvents;
      r.sessions += row.sessions;
      r.sessionsWithErrors += row.sessionsWithErrors;
      r.errorCount += row.errorCount;
      r.userDays += row.activeUsers;
      r.activeDays += 1;
      releases.set(key, r);
    }

    return {
      truncated: rows.length === MAX_ROWS,
      releases: [...releases.values()]
        .map((r) => ({
          platform: r.platform,
          appVersion: r.appVersion,
          firstDate: r.firstDate,
          lastDate: r.lastDate,
          totalEvents: r.totalEvents,
          sessions: r.sessions,
          errorCount: r.errorCount,
          avgDailyUsers: r.activeDays ? Math.round(r.userDays / r.activeDays) : 0,
          errorFreeSessionRate: r.sessions > 0 ? 1 - r.sessionsWithErrors / r.sessions : null,
          errorsPer1kSessions: r.sessions > 0 ? Math.round((r.errorCount / r.sessions) * 1000 * 10) / 10 : null,
        }))
        .sort((a, b) => a.platform.localeCompare(b.platform) || compareVersionsDesc(a.appVersion, b.appVersion)),
    };
  },
});
