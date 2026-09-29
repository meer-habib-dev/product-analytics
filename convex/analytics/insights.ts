import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireProjectAccess, requireProjectDoc } from "../lib/authz";
import { insightConfig } from "../lib/validators";

function validate(name: string, config: { eventNames: string[]; days: number }) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new ConvexError({ code: "invalid", message: "Name must be 1–80 characters." });
  if (config.eventNames.length < 1 || config.eventNames.length > 10) {
    throw new ConvexError({ code: "invalid", message: "Pick between 1 and 10 events." });
  }
  if (![7, 14, 30, 90].includes(config.days)) throw new ConvexError({ code: "invalid", message: "Unsupported range." });
  return trimmed;
}

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectAccess(ctx, projectId);
    const insights = await ctx.db
      .query("savedInsights")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(200);
    return insights.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const create = mutation({
  args: { projectId: v.id("projects"), name: v.string(), config: insightConfig },
  handler: async (ctx, args) => {
    const { userId } = await requireProjectAccess(ctx, args.projectId);
    const name = validate(args.name, args.config);
    const now = Date.now();
    return await ctx.db.insert("savedInsights", {
      projectId: args.projectId,
      name,
      kind: "trend",
      config: args.config,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { insightId: v.id("savedInsights") },
  handler: async (ctx, { insightId }) => {
    await requireProjectDoc(ctx, insightId);
    await ctx.db.delete(insightId);
  },
});
