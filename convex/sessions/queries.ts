import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireProjectAccess } from "../lib/authz";

/** Timelines longer than this are truncated; mobile sessions rarely come close. */
const MAX_TIMELINE_EVENTS = 1000;

export const getSessions = query({
  args: {
    projectId: v.id("projects"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const page = await ctx.db
      .query("sessions")
      .withIndex("by_project_started", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...page, page: page.page.map(withDuration) };
  },
});

export const getSessionTimeline = query({
  args: { projectId: v.id("projects"), sessionId: v.string() },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_project_session", (q) => q.eq("projectId", args.projectId).eq("sessionId", args.sessionId))
      .unique();
    if (!session) return null;
    const events = await ctx.db
      .query("events")
      .withIndex("by_project_session_time", (q) => q.eq("projectId", args.projectId).eq("sessionId", args.sessionId))
      .take(MAX_TIMELINE_EVENTS);
    const person = await ctx.db.get(session.personId);
    return {
      session: withDuration(session),
      person: person ? { _id: person._id, distinctId: person.distinctId } : null,
      events,
      truncated: events.length === MAX_TIMELINE_EVENTS,
    };
  },
});

function withDuration<T extends { startedAt: number; lastEventAt: number; endedAt?: number }>(session: T) {
  const end = Math.max(session.lastEventAt, session.endedAt ?? 0);
  return { ...session, durationMs: end - session.startedAt };
}
