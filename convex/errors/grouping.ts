import { utcDay } from "@analytics/shared";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ValidatedEventValue } from "../lib/validators";
import { computeErrorSignature } from "./fingerprint";

/**
 * Upserts the error group for an `$error` event and maintains its exact
 * affected-user count, per-release breakdown and daily timeline.
 * The fingerprint is always computed server-side; clients can't pick groups.
 */
export async function recordErrorOccurrence(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  event: ValidatedEventValue,
  personId: Id<"people">,
): Promise<Id<"errorGroups">> {
  const signature = computeErrorSignature(event.properties);
  const fatal = event.properties.fatal === true;
  const { platform, appVersion } = event.context;

  const existing = await ctx.db
    .query("errorGroups")
    .withIndex("by_project_fingerprint", (q) => q.eq("projectId", projectId).eq("fingerprint", signature.fingerprint))
    .unique();

  let groupId: Id<"errorGroups">;
  let isNewAffectedUser: boolean;

  if (existing) {
    groupId = existing._id;
    isNewAffectedUser = await touchAffectedUser(ctx, groupId, personId, event.timestamp);
    const isLatest = event.timestamp >= existing.lastSeenAt;
    await ctx.db.patch(groupId, {
      occurrenceCount: existing.occurrenceCount + 1,
      fatalCount: existing.fatalCount + (fatal ? 1 : 0),
      affectedUserCount: existing.affectedUserCount + (isNewAffectedUser ? 1 : 0),
      firstSeenAt: Math.min(existing.firstSeenAt, event.timestamp),
      lastSeenAt: Math.max(existing.lastSeenAt, event.timestamp),
      // A resolved error that happens again is a regression.
      status: existing.status === "resolved" && isLatest ? "unresolved" : existing.status,
      ...(isLatest ? { lastAppVersion: appVersion, lastPlatform: platform } : {}),
    });
  } else {
    groupId = await ctx.db.insert("errorGroups", {
      projectId,
      fingerprint: signature.fingerprint,
      title: signature.title,
      name: signature.name,
      message: signature.message,
      culprit: signature.culprit,
      status: "unresolved",
      firstSeenAt: event.timestamp,
      lastSeenAt: event.timestamp,
      occurrenceCount: 1,
      fatalCount: fatal ? 1 : 0,
      affectedUserCount: 1,
      lastAppVersion: appVersion,
      lastPlatform: platform,
    });
    await touchAffectedUser(ctx, groupId, personId, event.timestamp);
  }

  await incrementRelease(ctx, projectId, groupId, platform ?? "unknown", appVersion ?? "unknown", event.timestamp);
  await incrementDaily(ctx, groupId, utcDay(event.timestamp));
  return groupId;
}

async function touchAffectedUser(ctx: MutationCtx, errorGroupId: Id<"errorGroups">, personId: Id<"people">, timestamp: number) {
  const row = await ctx.db
    .query("errorGroupPeople")
    .withIndex("by_group_person", (q) => q.eq("errorGroupId", errorGroupId).eq("personId", personId))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, {
      occurrenceCount: row.occurrenceCount + 1,
      lastSeenAt: Math.max(row.lastSeenAt, timestamp),
      firstSeenAt: Math.min(row.firstSeenAt, timestamp),
    });
    return false;
  }
  await ctx.db.insert("errorGroupPeople", { errorGroupId, personId, firstSeenAt: timestamp, lastSeenAt: timestamp, occurrenceCount: 1 });
  return true;
}

async function incrementRelease(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  errorGroupId: Id<"errorGroups">,
  platform: string,
  appVersion: string,
  timestamp: number,
) {
  const row = await ctx.db
    .query("errorGroupReleases")
    .withIndex("by_group", (q) => q.eq("errorGroupId", errorGroupId).eq("platform", platform).eq("appVersion", appVersion))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, {
      occurrenceCount: row.occurrenceCount + 1,
      firstSeenAt: Math.min(row.firstSeenAt, timestamp),
      lastSeenAt: Math.max(row.lastSeenAt, timestamp),
    });
  } else {
    await ctx.db.insert("errorGroupReleases", {
      projectId,
      errorGroupId,
      platform,
      appVersion,
      occurrenceCount: 1,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    });
  }
}

async function incrementDaily(ctx: MutationCtx, errorGroupId: Id<"errorGroups">, date: string) {
  const row = await ctx.db
    .query("errorGroupDailyStats")
    .withIndex("by_group_date", (q) => q.eq("errorGroupId", errorGroupId).eq("date", date))
    .unique();
  if (row) await ctx.db.patch(row._id, { occurrences: row.occurrences + 1 });
  else await ctx.db.insert("errorGroupDailyStats", { errorGroupId, date, occurrences: 1 });
}
