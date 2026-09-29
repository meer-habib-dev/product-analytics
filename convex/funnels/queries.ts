import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireProjectAccess, requireProjectDoc } from "../lib/authz";

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectAccess(ctx, projectId);
    const funnels = await ctx.db
      .query("funnels")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(200);
    const withSteps = await Promise.all(
      funnels.map(async (funnel) => ({
        ...funnel,
        steps: await ctx.db
          .query("funnelSteps")
          .withIndex("by_funnel_order", (q) => q.eq("funnelId", funnel._id))
          .collect(),
      })),
    );
    return withSteps.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = query({
  args: { funnelId: v.id("funnels") },
  handler: async (ctx, { funnelId }) => {
    const { doc } = await requireProjectDoc(ctx, funnelId);
    const steps = await ctx.db
      .query("funnelSteps")
      .withIndex("by_funnel_order", (q) => q.eq("funnelId", funnelId))
      .collect();
    return { ...doc, steps };
  },
});
