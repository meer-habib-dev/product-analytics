import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Dashboard authorization. Ingestion never goes through here: the public
 * project key only reaches the HTTP ingestion endpoint and internal functions.
 */

export async function requireUser(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError({ code: "unauthenticated", message: "Sign in required." });
  return userId;
}

export interface ProjectAccess {
  userId: Id<"users">;
  project: Doc<"projects">;
  membership: Doc<"projectMembers">;
}

export async function requireProjectAccess(ctx: QueryCtx, projectId: Id<"projects">): Promise<ProjectAccess> {
  const userId = await requireUser(ctx);
  const membership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_user", (q) => q.eq("projectId", projectId).eq("userId", userId))
    .unique();
  const project = membership ? await ctx.db.get(projectId) : null;
  // Same error for "missing" and "forbidden" so project ids cannot be probed.
  if (!membership || !project) throw new ConvexError({ code: "not_found", message: "Project not found." });
  return { userId, project, membership };
}

export async function requireProjectOwner(ctx: QueryCtx, projectId: Id<"projects">): Promise<ProjectAccess> {
  const access = await requireProjectAccess(ctx, projectId);
  if (access.membership.role !== "owner") {
    throw new ConvexError({ code: "forbidden", message: "Only project owners can do this." });
  }
  return access;
}

/** Loads a project-scoped document and verifies it belongs to a project the caller can access. */
export async function requireProjectDoc<T extends "funnels" | "errorGroups" | "people" | "savedInsights" | "projectApiKeys">(
  ctx: QueryCtx,
  id: Id<T>,
): Promise<{ doc: Doc<T>; access: ProjectAccess }> {
  const doc = (await ctx.db.get(id)) as Doc<T> | null;
  if (!doc) throw new ConvexError({ code: "not_found", message: "Not found." });
  const access = await requireProjectAccess(ctx, (doc as unknown as { projectId: Id<"projects"> }).projectId);
  return { doc, access };
}
