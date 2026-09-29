import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

const BATCH = 200;

/**
 * After an anonymous person is merged into an identified one, re-point its
 * events and sessions so timelines and funnels see one person. Runs in the
 * background in small batches to keep ingestion fast; merges are rare
 * (typically a login on a second device) and usually small.
 */
export const reassignPerson = internalMutation({
  args: { fromPersonId: v.id("people"), toPersonId: v.id("people") },
  handler: async (ctx, { fromPersonId, toPersonId }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_person_time", (q) => q.eq("personId", fromPersonId))
      .take(BATCH);
    for (const event of events) await ctx.db.patch(event._id, { personId: toPersonId });

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_person_started", (q) => q.eq("personId", fromPersonId))
      .take(BATCH);
    for (const session of sessions) await ctx.db.patch(session._id, { personId: toPersonId });

    if (events.length === BATCH || sessions.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.people.merge.reassignPerson, { fromPersonId, toPersonId });
    }
  },
});
