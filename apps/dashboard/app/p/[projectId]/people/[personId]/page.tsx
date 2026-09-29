"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { EventTable } from "@/components/analytics/event-table";
import { SessionTable } from "@/components/analytics/session-table";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, personLabel } from "@/lib/format";

export default function PersonPage() {
  const personId = useParams<{ personId: string }>().personId as Id<"people">;
  const person = useQuery(api.people.queries.getPerson, { personId });
  const timeline = usePaginatedQuery(api.people.queries.getPersonTimeline, person ? { personId: person._id } : "skip", {
    initialNumItems: 50,
  });

  if (!person) return <Skeleton className="h-96" />;
  const traits = Object.entries(person.properties);

  return (
    <>
      <PageHeader
        title={personLabel(person)}
        description={person.distinctId ? "Identified person" : "Anonymous person (not identified yet)"}
        actions={<Badge variant="outline">{[person.lastPlatform, person.lastAppVersion].filter(Boolean).join(" ") || "unknown release"}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">First seen</dt>
              <dd>{formatDateTime(person.firstSeenAt)}</dd>
              <dt className="text-muted-foreground">Last seen</dt>
              <dd>{formatDateTime(person.lastSeenAt)}</dd>
              <dt className="text-muted-foreground">Anonymous ids</dt>
              <dd className="flex flex-col font-mono text-xs">
                {person.anonymousIds.map((id) => (
                  <span key={id} className="truncate">
                    {id}
                  </span>
                ))}
              </dd>
            </dl>
            <h4 className="mb-1.5 mt-5 text-xs font-medium text-muted-foreground">Traits</h4>
            {traits.length === 0 ? (
              <p className="text-muted-foreground">None. Pass traits to identify() to see them here.</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {traits.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="truncate">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {person.recentSessions.length ? (
              <SessionTable sessions={person.recentSessions} showPerson={false} />
            ) : (
              <p className="text-sm text-muted-foreground">No sessions.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <EventTable events={timeline.results} status={timeline.status} loadMore={timeline.loadMore} showPerson={false} />
        </CardContent>
      </Card>
    </>
  );
}
