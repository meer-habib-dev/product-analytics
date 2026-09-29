"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/analytics/empty-state";
import { ErrorStatusBadge } from "@/components/analytics/error-status";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateRange } from "@/lib/date-range";
import { formatNumber, formatRelative } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";

type Status = "unresolved" | "resolved" | "ignored";

export default function ErrorsPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { range } = useDateRange();
  const platform = params.get("platform") ?? undefined;
  const appVersion = params.get("version") ?? undefined;
  const status = (params.get("status") ?? "unresolved") as Status | "all";
  const options = useQuery(api.errors.queries.getErrorFilterOptions, { projectId });
  const errors = useQuery(api.errors.queries.getErrors, {
    projectId,
    range,
    platform,
    appVersion,
    status: status === "all" ? undefined : status,
  });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <>
      <PageHeader title="Errors" description="JavaScript errors grouped by cause. Filters apply to when and where they happened." actions={<DateRangePicker />} />
      <div className="mb-3 flex flex-wrap gap-2">
        <NativeSelect className="w-40" value={status} onChange={(e) => setParam("status", e.target.value)} aria-label="Status">
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
          <option value="all">All statuses</option>
        </NativeSelect>
        <NativeSelect className="w-40" value={platform ?? ""} onChange={(e) => setParam("platform", e.target.value)} aria-label="Platform">
          <option value="">All platforms</option>
          {options?.platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="w-40" value={appVersion ?? ""} onChange={(e) => setParam("version", e.target.value)} aria-label="App version">
          <option value="">All versions</option>
          {options?.appVersions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </div>
      {errors === undefined ? (
        <Skeleton className="h-64" />
      ) : errors.length === 0 ? (
        <EmptyState title="No errors match" description="Handled errors come from analytics.error(); uncaught JS errors are captured automatically." />
      ) : (
        <Card>
          <CardContent className="pt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Occurrences</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="hidden md:table-cell">Latest release</TableHead>
                  <TableHead className="hidden sm:table-cell">First seen</TableHead>
                  <TableHead className="text-right">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((e) => (
                  <TableRow key={e._id} className="cursor-pointer" onClick={() => router.push(href(`/errors/${e._id}`))}>
                    <TableCell className="max-w-md">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{e.title}</span>
                        {e.fatalCount > 0 && <span className="shrink-0 rounded border px-1 text-[10px] uppercase text-muted-foreground">fatal</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {e.status !== "unresolved" && <ErrorStatusBadge status={e.status} />}
                        <span className="truncate font-mono">{e.culprit ?? "no app frame"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(e.occurrenceCount)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(e.affectedUserCount)}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {[e.lastPlatform, e.lastAppVersion].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{formatRelative(e.firstSeenAt)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatRelative(e.lastSeenAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
