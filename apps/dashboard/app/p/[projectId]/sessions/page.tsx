"use client";

import { api } from "@convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { SessionTable } from "@/components/analytics/session-table";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectId } from "@/lib/hooks";

export default function SessionsPage() {
  const projectId = useProjectId();
  const { results, status, loadMore } = usePaginatedQuery(api.sessions.queries.getSessions, { projectId }, { initialNumItems: 50 });
  return (
    <>
      <PageHeader
        title="Sessions"
        description="A session starts at app launch or after 30 minutes of inactivity. Duration runs to the last event, so killed apps still count."
      />
      <Card>
        <CardContent className="pt-3">
          {status === "LoadingFirstPage" ? (
            <Skeleton className="h-64" />
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No sessions yet.</p>
          ) : (
            <SessionTable sessions={results} />
          )}
          {status === "CanLoadMore" && (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => loadMore(50)}>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
