import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireProjectOwner, requireUser } from "../lib/authz";
import { generateProjectKey, slugify } from "../lib/random";

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 64) {
    throw new ConvexError({ code: "invalid", message: "Project name must be 1–64 characters." });
  }
  return trimmed;
}

/** Creates a project, makes the caller its owner and issues the first ingestion key. */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = validateName(args.name);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name,
      slug: slugify(name),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("projectMembers", { projectId, userId, role: "owner", createdAt: now });
    await ctx.db.insert("projectApiKeys", {
      projectId,
      key: generateProjectKey(),
      name: "Default",
      enabled: true,
      createdAt: now,
    });
    return projectId;
  },
});

export const rename = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const name = validateName(args.name);
    await ctx.db.patch(args.projectId, { name, slug: slugify(name), updatedAt: Date.now() });
  },
});
