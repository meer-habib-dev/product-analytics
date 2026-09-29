import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireProjectAccess } from "../lib/authz";

/**
 * Live event explorer. Paginated and index-backed, so the reactive
 * subscription only covers the page on screen, never the whole table.
 */
export const listEvents = query({
  args: {
    projectId: v.id("projects"),
    eventName: v.optional(v.string()),
    personId: v.optional(v.id("people")),
    sessionId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const { projectId } = args;

    const base = args.sessionId
      ? ctx.db
          .query("events")
          .withIndex("by_project_session_time", (q) => q.eq("projectId", projectId).eq("sessionId", args.sessionId))
      : args.personId
        ? ctx.db.query("events").withIndex("by_person_time", (q) => q.eq("personId", args.personId!))
        : args.eventName
          ? ctx.db
              .query("events")
              .withIndex("by_project_name_time", (q) => q.eq("projectId", projectId).eq("eventName", args.eventName!))
          : ctx.db.query("events").withIndex("by_project_time", (q) => q.eq("projectId", projectId));

    // Secondary filters only narrow an already index-bounded, paginated scan.
    let filtered = base.order("desc").filter((q) => q.eq(q.field("projectId"), projectId));
    if (args.eventName && (args.personId || args.sessionId)) {
      filtered = filtered.filter((q) => q.eq(q.field("eventName"), args.eventName));
    }

    const page = await filtered.paginate(args.paginationOpts);
    return { ...page, page: await withPeople(ctx, page.page) };
  },
});

export const getEvent = query({
  args: { eventDocId: v.id("events") },
  handler: async (ctx, { eventDocId }) => {
    const event = await ctx.db.get(eventDocId);
    if (!event) return null;
    await requireProjectAccess(ctx, event.projectId);
    const person = await ctx.db.get(event.personId);
    return { ...event, person: person ? { _id: person._id, distinctId: person.distinctId } : null };
  },
});

async function withPeople(ctx: QueryCtx, events: Doc<"events">[]) {
  const ids = [...new Set(events.map((e) => e.personId))];
  const people = await Promise.all(ids.map((id) => ctx.db.get(id)));
  const byId = new Map(people.filter((p) => p !== null).map((p) => [p._id, p]));
  return events.map((e) => ({
    ...e,
    person: { _id: e.personId, distinctId: byId.get(e.personId)?.distinctId },
  }));
}
