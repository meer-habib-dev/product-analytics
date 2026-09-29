"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorStatusBadge } from "@/components/analytics/error-status";
import { StatCard } from "@/components/analytics/stat-card";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { useProjectHref } from "@/lib/hooks";

export default function ErrorDetailsPage() {
  const errorGroupId = useParams<{ errorGroupId: string }>().errorGroupId as Id<"errorGroups">;
  const href = useProjectHref();
  const details = useQuery(api.errors.queries.getErrorDetails, { errorGroupId });
  const setStatus = useMutation(api.errors.mutations.setStatus);

  if (!details) return <Skeleton className="h-96" />;
  const { group } = details;

  return (
    <>
      <PageHeader
        title={<span className="break-words">{group.title}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ErrorStatusBadge status={group.status} />
            <span className="font-mono text-xs">{group.culprit ?? "no application frame"}</span>
          </span>
        }
        actions={
          <>
            {group.status !== "resolved" && (
              <Button variant="outline" size="sm" onClick={() => void setStatus({ errorGroupId, status: "resolved" })}>
                Resolve
              </Button>
            )}
            {group.status !== "ignored" && (
              <Button variant="ghost" size="sm" onClick={() => void setStatus({ errorGroupId, status: "ignored" })}>
                Ignore
              </Button>
            )}
            {group.status !== "unresolved" && (
              <Button variant="ghost" size="sm" onClick={() => void setStatus({ errorGroupId, status: "unresolved" })}>
                Reopen
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Occurrences" value={formatNumber(group.occurrenceCount)} />
        <StatCard label="Affected users" value={formatNumber(group.affectedUserCount)} />
        <StatCard label="First seen" value={formatRelative(group.firstSeenAt)} hint={formatDateTime(group.firstSeenAt)} />
        <StatCard label="Last seen" value={formatRelative(group.lastSeenAt)} hint={formatDateTime(group.lastSeenAt)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Occurrences" description="Last 30 days" rows={details.timeline} series={[{ key: "occurrences", label: "Occurrences" }]} variant="bar" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>App versions</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={details.versions.map((v) => ({ key: v.key, label: v.key, value: v.occurrences, secondary: `last ${formatRelative(v.lastSeenAt)}` }))} />
            <h4 className="mb-1 mt-4 text-xs font-medium text-muted-foreground">Platforms</h4>
            <BarList items={details.platforms.map((p) => ({ key: p.key, label: p.key, value: p.occurrences }))} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Message and stack trace</CardTitle>
          <span className="text-xs text-muted-foreground">from the latest occurrence</span>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm">{group.message}</p>
          <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{details.stack ?? "No stack trace captured."}</pre>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent occurrences</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead className="hidden md:table-cell">Screen</TableHead>
                  <TableHead className="hidden md:table-cell">Device</TableHead>
                  <TableHead>Release</TableHead>
                  <TableHead>Session</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.occurrences.map((o) => (
                  <TableRow key={o._id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(o.timestamp)}
                      {o.fatal && <span className="ml-1.5 rounded border px-1 text-[10px] uppercase text-muted-foreground">fatal</span>}
                    </TableCell>
                    <TableCell className="max-w-32 truncate">
                      <Link href={href(`/people/${o.personId}`)} className="hover:underline">
                        {o.distinctId ?? "Anonymous"}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{o.screen ?? "—"}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {[o.deviceModel, o.osVersion].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{[o.platform, o.appVersion].filter(Boolean).join(" ")}</TableCell>
                    <TableCell>
                      {o.sessionId && (
                        <Link href={href(`/sessions/${encodeURIComponent(o.sessionId)}`)} className="text-xs text-muted-foreground hover:text-foreground">
                          View →
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Affected users</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {details.affectedUsers.map((u) => (
                <li key={u.personId} className="flex items-center justify-between gap-2 py-1.5">
                  <Link href={href(`/people/${u.personId}`)} className="truncate hover:underline">
                    {u.distinctId ?? "Anonymous"}
                  </Link>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {u.occurrenceCount}× · {formatRelative(u.lastSeenAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
