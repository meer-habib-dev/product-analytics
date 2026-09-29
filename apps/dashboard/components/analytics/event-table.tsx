"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EventRow, type EventRowData } from "./event-row";

export function EventTable({
  events,
  status,
  loadMore,
  showPerson = true,
  emptyLabel = "No events yet.",
}: {
  events: EventRowData[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (n: number) => void;
  showPerson?: boolean;
  emptyLabel?: string;
}) {
  if (status === "LoadingFirstPage") return <Skeleton className="h-64" />;
  if (events.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-6" />
            <TableHead>Event</TableHead>
            {showPerson && <TableHead>Person</TableHead>}
            <TableHead className="hidden lg:table-cell">Properties</TableHead>
            <TableHead className="hidden md:table-cell">Release</TableHead>
            <TableHead className="text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <EventRow key={event._id} event={event} showPerson={showPerson} />
          ))}
        </TableBody>
      </Table>
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" size="sm" disabled={status === "LoadingMore"} onClick={() => loadMore(50)}>
            {status === "LoadingMore" ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
