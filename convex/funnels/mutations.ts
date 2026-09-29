import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, type MutationCtx } from "../_generated/server";
import { requireProjectAccess, requireProjectDoc } from "../lib/authz";

const stepInput = v.object({
  eventName: v.string(),
  label: v.optional(v.string()),
  propertyFilter: v.optional(v.object({ key: v.string(), value: v.string() })),
});

const MIN_STEPS = 2;
const MAX_STEPS = 10;
const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

type StepInput = { eventName: string; label?: string; propertyFilter?: { key: string; value: string } };

function validate(args: { name: string; steps: StepInput[]; conversionWindowMs: number }) {
  const name = args.name.trim();
  if (!name || name.length > 80) throw new ConvexError({ code: "invalid", message: "Name must be 1–80 characters." });
  if (args.steps.length < MIN_STEPS || args.steps.length > MAX_STEPS) {
    throw new ConvexError({ code: "invalid", message: `A funnel needs ${MIN_STEPS}–${MAX_STEPS} steps.` });
  }
  if (args.steps.some((s) => !s.eventName.trim())) throw new ConvexError({ code: "invalid", message: "Every step needs an event." });
  if (args.conversionWindowMs < 60_000 || args.conversionWindowMs > MAX_WINDOW_MS) {
    throw new ConvexError({ code: "invalid", message: "Conversion window must be between 1 minute and 90 days." });
  }
  return name;
}

async function replaceSteps(ctx: MutationCtx, projectId: Id<"projects">, funnelId: Id<"funnels">, steps: StepInput[]) {
  const existing = await ctx.db
    .query("funnelSteps")
    .withIndex("by_funnel_order", (q) => q.eq("funnelId", funnelId))
    .collect();
  for (const step of existing) await ctx.db.delete(step._id);
  for (const [order, step] of steps.entries()) {
    await ctx.db.insert("funnelSteps", {
      projectId,
      funnelId,
      order,
      eventName: step.eventName.trim(),
      label: step.label?.trim() || undefined,
      propertyFilter: step.propertyFilter?.key.trim() ? step.propertyFilter : undefined,
    });
  }
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    conversionWindowMs: v.number(),
    steps: v.array(stepInput),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireProjectAccess(ctx, args.projectId);
    const name = validate(args);
    const now = Date.now();
    const funnelId = await ctx.db.insert("funnels", {
      projectId: args.projectId,
      name,
      description: args.description?.trim() || undefined,
      conversionWindowMs: args.conversionWindowMs,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    await replaceSteps(ctx, args.projectId, funnelId, args.steps);
    return funnelId;
  },
});

export const update = mutation({
  args: {
    funnelId: v.id("funnels"),
    name: v.string(),
    description: v.optional(v.string()),
    conversionWindowMs: v.number(),
    steps: v.array(stepInput),
  },
  handler: async (ctx, args) => {
    const { doc } = await requireProjectDoc(ctx, args.funnelId);
    const name = validate(args);
    await ctx.db.patch(args.funnelId, {
      name,
      description: args.description?.trim() || undefined,
      conversionWindowMs: args.conversionWindowMs,
      updatedAt: Date.now(),
    });
    await replaceSteps(ctx, doc.projectId, args.funnelId, args.steps);
  },
});

export const remove = mutation({
  args: { funnelId: v.id("funnels") },
  handler: async (ctx, { funnelId }) => {
    await requireProjectDoc(ctx, funnelId);
    const steps = await ctx.db
      .query("funnelSteps")
      .withIndex("by_funnel_order", (q) => q.eq("funnelId", funnelId))
      .collect();
    for (const step of steps) await ctx.db.delete(step._id);
    await ctx.db.delete(funnelId);
  },
});
