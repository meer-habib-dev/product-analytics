"use client";

import type { Doc } from "@convex/_generated/dataModel";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useProjectHref } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export type EventRowData = Doc<"events"> & { person?: { _id: string; distinctId?: string } };

export function eventLabel(event: Pick<Doc<"events">, "eventName" | "properties">): string {
  if (event.eventName === "$screen" && typeof event.properties.name === "string") return `$screen · ${event.properties.name}`;
  if (event.eventName === "$error" && typeof event.properties.message === "string") return `$error · ${event.properties.message}`;
  return event.eventName;
}

function summarize(properties: Record<string, unknown>): string {
  return Object.entries(properties)
    .filter(([key]) => key !== "stack")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("  ·  ");
}

/** One event in a table; click to expand ids, properties and context. */
export function EventRow({ event, showPerson = true }: { event: EventRowData; showPerson?: boolean }) {
  const [open, setOpen] = useState(false);
  const href = useProjectHref();
  const isError = event.eventName === "$error";
  return (
    <Fragment>
      <TableRow className="cursor-pointer" onClick={() => setOpen(!open)}>
        <TableCell className="w-6 pr-0">
          <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
        </TableCell>
        <TableCell className="max-w-72 truncate font-mono text-[13px]">
          <span className={cn(isError && "text-status-critical")}>{eventLabel(event)}</span>
        </TableCell>
        {showPerson && (
          <TableCell className="max-w-40 truncate">
            <Link href={href(`/people/${event.personId}`)} onClick={(e) => e.stopPropagation()} className="hover:underline">
              {event.distinctId ?? <span className="text-muted-foreground">{event.anonymousId.slice(0, 14)}…</span>}
            </Link>
          </TableCell>
        )}
        <TableCell className="hidden max-w-80 truncate text-xs text-muted-foreground lg:table-cell">{summarize(event.properties)}</TableCell>
        <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
          {[event.context.platform, event.context.appVersion].filter(Boolean).join(" ")}
        </TableCell>
        <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground" title={formatDateTime(event.timestamp)}>
          {formatRelative(event.timestamp)}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-muted/30">
            <EventDetails event={event} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

function EventDetails({ event }: { event: EventRowData }) {
  const href = useProjectHref();
  const { stack, ...properties } = event.properties;
  const ids: Array<[string, string | undefined, string | undefined]> = [
    ["eventId", event.eventId, undefined],
    ["distinctId", event.distinctId, undefined],
    ["anonymousId", event.anonymousId, undefined],
    ["sessionId", event.sessionId, event.sessionId ? href(`/sessions/${encodeURIComponent(event.sessionId)}`) : undefined],
    ["timestamp", new Date(event.timestamp).toISOString(), undefined],
    ["receivedAt", new Date(event.receivedAt).toISOString(), undefined],
  ];
  return (
    <div className="grid gap-4 py-2 text-xs md:grid-cols-3">
      <KeyValues title="Event" entries={ids} />
      <KeyValues title="Properties" entries={Object.entries(properties).map(([k, v]) => [k, JSON.stringify(v), undefined])} />
      <KeyValues title="Context" entries={Object.entries(event.context).map(([k, v]) => [k, String(v), undefined])} />
      {typeof stack === "string" && (
        <pre className="overflow-x-auto rounded border bg-card p-2 font-mono text-[11px] md:col-span-3">{stack}</pre>
      )}
      {event.errorGroupId && (
        <Link href={href(`/errors/${event.errorGroupId}`)} className="text-sm underline-offset-4 hover:underline md:col-span-3">
          View error group →
        </Link>
      )}
    </div>
  );
}

function KeyValues({ title, entries }: { title: string; entries: Array<[string, string | undefined, string | undefined]> }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-medium text-foreground">{title}</div>
      {entries.length === 0 ? (
        <div className="text-muted-foreground">None</div>
      ) : (
        <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-0.5">
          {entries.map(([key, value, link]) => (
            <Fragment key={key}>
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="truncate font-mono" title={value}>
                {link ? (
                  <Link href={link} className="underline-offset-4 hover:underline">
                    {value}
                  </Link>
                ) : (
                  (value ?? "—")
                )}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
