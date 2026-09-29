"use client";

import type { Id } from "@convex/_generated/dataModel";
import { useParams, useSearchParams } from "next/navigation";

export function useProjectId(): Id<"projects"> {
  const { projectId } = useParams<{ projectId: string }>();
  return projectId as Id<"projects">;
}

/** Builds project-scoped links that keep the current date range. */
export function useProjectHref() {
  const projectId = useProjectId();
  const params = useSearchParams();
  const range = params.get("range");
  return (path = "", extra?: Record<string, string>) => {
    const search = new URLSearchParams(extra);
    if (range) search.set("range", range);
    const query = search.toString();
    return `/p/${projectId}${path}${query ? `?${query}` : ""}`;
  };
}
