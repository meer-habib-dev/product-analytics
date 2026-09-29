"use client";

import type { Doc } from "@convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useProjectHref } from "@/lib/hooks";

type SessionRow = Doc<"sessions"> & { durationMs?: number };

export function SessionTable({ sessions, showPerson = true }: { sessions: SessionRow[]; showPerson?: boolean }) {
  const router = useRouter();
  const href = useProjectHref();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          {showPerson && <TableHead>Person</TableHead>}
          <TableHead className="text-right">Duration</TableHead>
          <TableHead className="text-right">Events</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Screens</TableHead>
          <TableHead className="text-right">Errors</TableHead>
          <TableHead className="hidden md:table-cell">Entry screen</TableHead>
          <TableHead className="hidden md:table-cell">Release</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => (
          <TableRow key={s._id} className="cursor-pointer" onClick={() => router.push(href(`/sessions/${encodeURIComponent(s.sessionId)}`))}>
            <TableCell className="whitespace-nowrap">{formatDateTime(s.startedAt)}</TableCell>
            {showPerson && (
              <TableCell className="max-w-40 truncate">{s.distinctId ?? <span className="text-muted-foreground">Anonymous</span>}</TableCell>
            )}
            <TableCell className="tabular text-right">{formatDuration(s.durationMs ?? Math.max(s.lastEventAt, s.endedAt ?? 0) - s.startedAt)}</TableCell>
            <TableCell className="tabular text-right">{s.eventCount}</TableCell>
            <TableCell className="tabular hidden text-right sm:table-cell">{s.screenCount}</TableCell>
            <TableCell className={`tabular text-right ${s.errorCount > 0 ? "font-medium text-status-critical" : ""}`}>{s.errorCount}</TableCell>
            <TableCell className="hidden max-w-40 truncate text-muted-foreground md:table-cell">{s.entryScreen ?? "—"}</TableCell>
            <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
              {[s.platform, s.appVersion].filter(Boolean).join(" ") || "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
