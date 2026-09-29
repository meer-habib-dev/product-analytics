import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const BATCH = 500;

/** Unique-user markers are only needed while events can still land in their bucket. */
export const deleteExpiredMarkers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("uniqueMarkers")
      .withIndex("by_expires", (q) => q.lt("expiresAt", Date.now()))
      .take(BATCH);
    for (const marker of expired) await ctx.db.delete(marker._id);
    if (expired.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.analytics.maintenance.deleteExpiredMarkers, {});
    }
  },
});
