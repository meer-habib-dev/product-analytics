"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EventTable } from "@/components/analytics/event-table";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { useProjectId } from "@/lib/hooks";

/**
 * Live event explorer. The first page is a reactive, index-backed query, so
 * new events appear without refreshing; older pages load on demand.
 */
export default function EventsPage() {
  const projectId = useProjectId();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const eventName = params.get("event") ?? undefined;
  const personId = (params.get("person") ?? undefined) as Id<"people"> | undefined;
  const definitions = useQuery(api.analytics.events.listEventDefinitions, { projectId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.events.queries.listEvents,
    { projectId, eventName, personId },
    { initialNumItems: 50 },
  );

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <>
      <PageHeader
        title="Events"
        description={
          <span className="flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-good opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-status-good" />
            </span>
            Live: new events appear automatically
          </span>
        }
        actions={
          <NativeSelect className="w-56" value={eventName ?? ""} onChange={(e) => setParam("event", e.target.value || undefined)} aria-label="Event name">
            <option value="">All events</option>
            {definitions?.map((d) => (
              <option key={d.eventName} value={d.eventName}>
                {d.eventName}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {personId && (
        <div className="mb-3">
          <Badge variant="outline" className="gap-1.5">
            Person {personId.slice(-6)}
            <button type="button" aria-label="Clear person filter" onClick={() => setParam("person", undefined)}>
              <X className="size-3" />
            </button>
          </Badge>
        </div>
      )}
      <Card>
        <CardContent className="pt-3">
          <EventTable events={results} status={status} loadMore={loadMore} emptyLabel="No events match. Send one from your app to see it here." />
        </CardContent>
      </Card>
    </>
  );
}
