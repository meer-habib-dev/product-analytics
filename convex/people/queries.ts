import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";
import { requireProjectAccess } from "../lib/authz";

export const getPeople = query({
  args: {
    projectId: v.id("projects"),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const search = args.search?.trim();
    const page = search
      ? await ctx.db
          .query("people")
          .withSearchIndex("search_people", (q) => q.search("searchText", search).eq("projectId", args.projectId))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("people")
          .withIndex("by_project_last_seen", (q) => q.eq("projectId", args.projectId))
          .order("desc")
          .filter((q) => q.eq(q.field("mergedIntoId"), undefined))
          .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page
        .filter((p) => p.mergedIntoId === undefined)
        .map((p) => ({
          _id: p._id,
          distinctId: p.distinctId,
          email: typeof p.properties.email === "string" ? p.properties.email : undefined,
          name: typeof p.properties.name === "string" ? p.properties.name : undefined,
          firstSeenAt: p.firstSeenAt,
          lastSeenAt: p.lastSeenAt,
          lastPlatform: p.lastPlatform,
          lastAppVersion: p.lastAppVersion,
        })),
    };
  },
});

export const getPerson = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    let person = await ctx.db.get(personId);
    if (!person) throw new ConvexError({ code: "not_found", message: "Person not found." });
    await requireProjectAccess(ctx, person.projectId);
    // Links to merged anonymous persons resolve to the person they were merged into.
    if (person.mergedIntoId) person = (await ctx.db.get(person.mergedIntoId)) ?? person;

    const aliases = await ctx.db
      .query("personAliases")
      .withIndex("by_person", (q) => q.eq("personId", person._id))
      .take(50);
    const recentSessions = await ctx.db
      .query("sessions")
      .withIndex("by_person_started", (q) => q.eq("personId", person._id))
      .order("desc")
      .take(20);

    return {
      ...person,
      anonymousIds: aliases.map((a) => a.anonymousId),
      recentSessions,
    };
  },
});

/** A person's activity, newest first. Merged anonymous activity is re-pointed to this person in the background. */
export const getPersonTimeline = query({
  args: { personId: v.id("people"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { personId, paginationOpts }) => {
    const person = await ctx.db.get(personId);
    if (!person) throw new ConvexError({ code: "not_found", message: "Person not found." });
    await requireProjectAccess(ctx, person.projectId);
    return await ctx.db
      .query("events")
      .withIndex("by_person_time", (q) => q.eq("personId", personId))
      .order("desc")
      .paginate(paginationOpts);
  },
});
