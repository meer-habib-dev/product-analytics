import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireProjectAccess, requireUser } from "../lib/authz";

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);
    const projects = await Promise.all(memberships.map((m) => ctx.db.get(m.projectId)));
    return projects
      .filter((p) => p !== null)
      .map((p) => ({ _id: p._id, name: p.name, slug: p.slug, firstEventAt: p.firstEventAt }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const { project, membership } = await requireProjectAccess(ctx, projectId);
    return { ...project, role: membership.role };
  },
});
