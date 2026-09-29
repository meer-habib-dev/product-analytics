import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireProjectDoc } from "../lib/authz";
import { errorStatus } from "../lib/validators";

export const setStatus = mutation({
  args: { errorGroupId: v.id("errorGroups"), status: errorStatus },
  handler: async (ctx, { errorGroupId, status }) => {
    await requireProjectDoc(ctx, errorGroupId);
    await ctx.db.patch(errorGroupId, { status });
  },
});
