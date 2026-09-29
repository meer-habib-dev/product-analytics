import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { requireProjectAccess, requireProjectDoc, requireProjectOwner } from "../lib/authz";
import { generateProjectKey } from "../lib/random";

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectAccess(ctx, projectId);
    const keys = await ctx.db
      .query("projectApiKeys")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(50);
    return keys.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const create = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, { projectId, name }) => {
    await requireProjectOwner(ctx, projectId);
    const trimmed = name.trim().slice(0, 64) || "Untitled key";
    return await ctx.db.insert("projectApiKeys", {
      projectId,
      key: generateProjectKey(),
      name: trimmed,
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

/** Disabling a key is the kill switch for a leaked or abused key: ingestion rejects it immediately. */
export const setEnabled = mutation({
  args: { keyId: v.id("projectApiKeys"), enabled: v.boolean() },
  handler: async (ctx, { keyId, enabled }) => {
    const { doc } = await requireProjectDoc(ctx, keyId);
    await requireProjectOwner(ctx, doc.projectId);
    if (!enabled) {
      const keys = await ctx.db
        .query("projectApiKeys")
        .withIndex("by_project", (q) => q.eq("projectId", doc.projectId))
        .take(50);
      if (!keys.some((k) => k._id !== keyId && k.enabled)) {
        throw new ConvexError({ code: "invalid", message: "Create another key before disabling the last active one." });
      }
    }
    await ctx.db.patch(keyId, { enabled });
  },
});

/**
 * The only thing a public key can be exchanged for: the project id it may
 * write events to. Internal so it can't be called from clients.
 */
export const resolveIngestionKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const apiKey = await ctx.db
      .query("projectApiKeys")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!apiKey) return null;
    return { keyId: apiKey._id, projectId: apiKey.projectId, enabled: apiKey.enabled };
  },
});
