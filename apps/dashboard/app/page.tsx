"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Sends users to their first project, or to project creation on first sign-in. */
export default function HomePage() {
  const projects = useQuery(api.projects.queries.listMine);
  const router = useRouter();

  useEffect(() => {
    if (projects === undefined) return;
    const first = projects[0];
    router.replace(first ? `/p/${first._id}${first.firstEventAt ? "" : "/setup"}` : "/projects/new");
  }, [projects, router]);

  return (
    <main className="p-8">
      <Skeleton className="h-6 w-48" />
    </main>
  );
}
