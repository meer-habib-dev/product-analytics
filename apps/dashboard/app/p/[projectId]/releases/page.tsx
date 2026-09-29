"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/analytics/empty-state";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateRange } from "@/lib/date-range";
import { formatDay, formatNumber, formatPercent } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";

export default function ReleasesPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const router = useRouter();
  const { range } = useDateRange();
  const data = useQuery(api.analytics.releases.getReleases, { projectId, range });

  return (
    <>
      <PageHeader
        title="Releases"
        description="Health per app version. Compare a new release with the previous one; click a row for its errors."
        actions={<DateRangePicker />}
      />
      {data === undefined ? (
        <Skeleton className="h-64" />
      ) : data.releases.length === 0 ? (
        <EmptyState title="No releases in this range" description="Versions come from expo-application automatically." />
      ) : (
        <Card>
          <CardContent className="pt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Release</TableHead>
                  <TableHead className="hidden sm:table-cell">Active</TableHead>
                  <TableHead className="text-right">Users/day</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Events</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Errors / 1k sessions</TableHead>
                  <TableHead className="text-right">Error-free sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.releases.map((r) => (
                  <TableRow
                    key={`${r.platform}-${r.appVersion}`}
                    className="cursor-pointer"
                    onClick={() => router.push(href("/errors", { version: r.appVersion, platform: r.platform, status: "all" }))}
                  >
                    <TableCell>
                      <span className="font-medium">{r.appVersion}</span> <span className="text-xs text-muted-foreground">{r.platform}</span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">
                      {formatDay(r.firstDate)} – {formatDay(r.lastDate)}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(r.avgDailyUsers)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(r.sessions)}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{formatNumber(r.totalEvents)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(r.errorCount)}</TableCell>
                    <TableCell className="tabular text-right">{r.errorsPer1kSessions ?? "—"}</TableCell>
                    <TableCell className="tabular text-right font-medium">{formatPercent(r.errorFreeSessionRate)}</TableCell>
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
