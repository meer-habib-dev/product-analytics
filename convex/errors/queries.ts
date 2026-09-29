import { addDays, compareVersionsDesc, daysBetween, utcDay } from "@analytics/shared";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireProjectAccess, requireProjectDoc } from "../lib/authz";
import { dateRange, normalizeRange, rangeToTimestamps } from "../lib/ranges";
import { errorStatus } from "../lib/validators";

const MAX_GROUPS = 200;
const MAX_RELEASE_ROWS = 2000;

export const getErrors = query({
  args: {
    projectId: v.id("projects"),
    range: dateRange,
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    status: v.optional(errorStatus),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const { start, end } = rangeToTimestamps(normalizeRange(args.range));

    const groups =
      args.platform || args.appVersion
        ? await groupsForRelease(ctx, args.projectId, args.platform, args.appVersion, start)
        : await ctx.db
            .query("errorGroups")
            .withIndex("by_project_last_seen", (q) => q.eq("projectId", args.projectId).gte("lastSeenAt", start))
            .order("desc")
            .take(MAX_GROUPS);

    return groups
      .filter((g) => g.lastSeenAt >= start && g.firstSeenAt <= end)
      .filter((g) => !args.status || g.status === args.status)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map(({ fingerprint: _fingerprint, ...group }) => group);
  },
});

/** Version/platform filters go through the per-release table, which is small (groups × releases). */
async function groupsForRelease(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  platform: string | undefined,
  appVersion: string | undefined,
  start: number,
): Promise<Doc<"errorGroups">[]> {
  const rows = appVersion
    ? await ctx.db
        .query("errorGroupReleases")
        .withIndex("by_project_version", (q) => q.eq("projectId", projectId).eq("appVersion", appVersion))
        .take(MAX_RELEASE_ROWS)
    : await ctx.db
        .query("errorGroupReleases")
        .withIndex("by_project_platform", (q) => q.eq("projectId", projectId).eq("platform", platform!))
        .take(MAX_RELEASE_ROWS);
  const ids = new Set(
    rows.filter((r) => (!platform || r.platform === platform) && r.lastSeenAt >= start).map((r) => r.errorGroupId),
  );
  const groups = await Promise.all([...ids].slice(0, MAX_GROUPS).map((id) => ctx.db.get(id)));
  return groups.filter((g) => g !== null);
}

/** Distinct platforms/versions that have errors, for the filter dropdowns. */
export const getErrorFilterOptions = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectAccess(ctx, projectId);
    const rows = await ctx.db
      .query("errorGroupReleases")
      .withIndex("by_project_version", (q) => q.eq("projectId", projectId))
      .take(MAX_RELEASE_ROWS);
    return {
      platforms: [...new Set(rows.map((r) => r.platform))].sort(),
      appVersions: [...new Set(rows.map((r) => r.appVersion))].sort(compareVersionsDesc),
    };
  },
});

export const getErrorDetails = query({
  args: { errorGroupId: v.id("errorGroups") },
  handler: async (ctx, { errorGroupId }) => {
    const { doc: group } = await requireProjectDoc(ctx, errorGroupId);

    const [releases, daily, occurrences, affected] = await Promise.all([
      ctx.db
        .query("errorGroupReleases")
        .withIndex("by_group", (q) => q.eq("errorGroupId", errorGroupId))
        .take(200),
      ctx.db
        .query("errorGroupDailyStats")
        .withIndex("by_group_date", (q) => q.eq("errorGroupId", errorGroupId).gte("date", addDays(utcDay(Date.now()), -29)))
        .collect(),
      ctx.db
        .query("events")
        .withIndex("by_error_group_time", (q) => q.eq("errorGroupId", errorGroupId))
        .order("desc")
        .take(25),
      ctx.db
        .query("errorGroupPeople")
        .withIndex("by_group_last_seen", (q) => q.eq("errorGroupId", errorGroupId))
        .order("desc")
        .take(25),
    ]);

    const people = await Promise.all(affected.map((a) => ctx.db.get(a.personId)));
    const dailyByDate = new Map(daily.map((d) => [d.date, d.occurrences]));
    const today = utcDay(Date.now());
    const latest = occurrences[0];

    return {
      group,
      stack: typeof latest?.properties.stack === "string" ? latest.properties.stack : undefined,
      timeline: daysBetween(addDays(today, -29), today).map((date) => ({ date, occurrences: dailyByDate.get(date) ?? 0 })),
      versions: summarizeBy(releases, (r) => r.appVersion).sort((a, b) => compareVersionsDesc(a.key, b.key)),
      platforms: summarizeBy(releases, (r) => r.platform).sort((a, b) => b.occurrences - a.occurrences),
      occurrences: occurrences.map((e) => ({
        _id: e._id,
        timestamp: e.timestamp,
        personId: e.personId,
        distinctId: e.distinctId,
        sessionId: e.sessionId,
        fatal: e.properties.fatal === true,
        screen: typeof e.properties.screen === "string" ? e.properties.screen : e.context.screen,
        message: typeof e.properties.message === "string" ? e.properties.message : undefined,
        appVersion: e.context.appVersion,
        platform: e.context.platform,
        osVersion: e.context.osVersion,
        deviceModel: e.context.deviceModel,
      })),
      affectedUsers: affected.map((a, i) => ({
        personId: a.personId,
        distinctId: people[i]?.distinctId,
        occurrenceCount: a.occurrenceCount,
        lastSeenAt: a.lastSeenAt,
      })),
    };
  },
});

function summarizeBy(rows: Doc<"errorGroupReleases">[], keyOf: (r: Doc<"errorGroupReleases">) => string) {
  const map = new Map<string, { key: string; occurrences: number; firstSeenAt: number; lastSeenAt: number }>();
  for (const r of rows) {
    const key = keyOf(r);
    const entry = map.get(key) ?? { key, occurrences: 0, firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt };
    entry.occurrences += r.occurrenceCount;
    entry.firstSeenAt = Math.min(entry.firstSeenAt, r.firstSeenAt);
    entry.lastSeenAt = Math.max(entry.lastSeenAt, r.lastSeenAt);
    map.set(key, entry);
  }
  return [...map.values()];
}
