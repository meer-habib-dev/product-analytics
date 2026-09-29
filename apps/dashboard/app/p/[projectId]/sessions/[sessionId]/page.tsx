"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Activity, AlertTriangle, Flag, Monitor, UserCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState } from "@/components/analytics/empty-state";
import { eventLabel } from "@/components/analytics/event-row";
import { StatCard } from "@/components/analytics/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function iconFor(eventName: string) {
  if (eventName === "$screen") return Monitor;
  if (eventName === "$error") return AlertTriangle;
  if (eventName === "$identify") return UserCheck;
  if (eventName.startsWith("$session")) return Flag;
  return Activity;
}

export default function SessionPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const sessionId = decodeURIComponent(useParams<{ sessionId: string }>().sessionId);
  const data = useQuery(api.sessions.queries.getSessionTimeline, { projectId, sessionId });

  if (data === undefined) return <Skeleton className="h-96" />;
  if (data === null) return <EmptyState title="Session not found" />;
  const { session, person, events } = data;

  return (
    <>
      <PageHeader
        title="Session"
        description={
          <>
            {formatDateTime(session.startedAt)} ·{" "}
            {person && (
              <Link href={href(`/people/${person._id}`)} className="underline-offset-4 hover:underline">
                {person.distinctId ?? "Anonymous person"}
              </Link>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Duration" value={formatDuration(session.durationMs)} />
        <StatCard label="Events" value={session.eventCount} />
        <StatCard label="Screens" value={session.screenCount} />
        <StatCard label="Errors" value={session.errorCount} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <span className="text-xs text-muted-foreground">{[session.platform, session.appVersion].filter(Boolean).join(" ")}</span>
        </CardHeader>
        <CardContent>
          <ol className="relative ml-2 border-l">
            {events.map((event) => {
              const Icon = iconFor(event.eventName);
              const isError = event.eventName === "$error";
              return (
                <li key={event._id} className="relative pb-3 pl-6">
                  <span
                    className={cn(
                      "absolute -left-[11px] top-0.5 flex size-5 items-center justify-center rounded-full border bg-card",
                      isError && "border-status-critical/50",
                    )}
                  >
                    <Icon className={cn("size-3 text-muted-foreground", isError && "text-status-critical")} />
                  </span>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-[13px]">
                      {isError && event.errorGroupId ? (
                        <Link href={href(`/errors/${event.errorGroupId}`)} className="text-status-critical hover:underline">
                          {eventLabel(event)}
                        </Link>
                      ) : (
                        eventLabel(event)
                      )}
                    </span>
                    <span className="tabular text-xs text-muted-foreground">+{formatDuration(event.timestamp - session.startedAt)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          {data.truncated && <p className="text-xs text-muted-foreground">Showing the first {events.length} events.</p>}
        </CardContent>
      </Card>
    </>
  );
}
