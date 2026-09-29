"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import Link from "next/link";
import { EmptyState } from "@/components/analytics/empty-state";
import { StatCard } from "@/components/analytics/stat-card";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard } from "@/components/charts/chart-card";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateRange } from "@/lib/date-range";
import { formatNumber, formatPercent, formatRelative, percentChange } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";

export default function OverviewPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const { range } = useDateRange();
  const project = useQuery(api.projects.queries.get, { projectId });
  const overview = useQuery(api.analytics.overview.getOverviewMetrics, { projectId, range });
  const topEvents = useQuery(api.analytics.events.getTopEvents, { projectId, range, limit: 8 });
  const errors = useQuery(api.errors.queries.getErrors, { projectId, range, status: "unresolved" });

  const t = overview?.totals;
  const p = overview?.previousTotals;

  return (
    <>
      <PageHeader title={project?.name ?? "Overview"} description="How your app is used, at a glance." actions={<DateRangePicker />} />

      {project && project.firstEventAt === undefined && (
        <EmptyState
          title="No events received yet"
          description="Install the SDK and send your first event. This page updates live."
          action={
            <Button asChild>
              <Link href={href("/setup")}>Set up the SDK</Link>
            </Button>
          }
        />
      )}

      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {t && p && overview ? (
          <>
            <StatCard label="Daily active users" value={formatNumber(overview.activeUsers.daily)} hint="Unique people on the last day of the range (UTC)" />
            <StatCard label="Weekly active users" value={formatNumber(overview.activeUsers.weekly)} hint={`Unique people in ISO week ${overview.activeUsers.week}`} />
            <StatCard label="Monthly active users" value={formatNumber(overview.activeUsers.monthly)} hint={`Unique people in ${overview.activeUsers.month}`} />
            <StatCard label="New users" value={formatNumber(t.newUsers)} change={percentChange(t.newUsers, p.newUsers)} />
            <StatCard label="Events" value={formatNumber(t.events)} change={percentChange(t.events, p.events)} />
            <StatCard label="Sessions" value={formatNumber(t.sessions)} change={percentChange(t.sessions, p.sessions)} />
            <StatCard label="Errors" value={formatNumber(t.errors)} change={percentChange(t.errors, p.errors)} higherIsBetter={false} />
            <StatCard label="Error-free sessions" value={formatPercent(t.errorFreeSessionRate)} hint="Sessions without any $error event" />
          </>
        ) : (
          Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[88px]" />)
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Daily active users"
          description="Unique people per UTC day"
          rows={overview?.series}
          series={[{ key: "activeUsers", label: "Active users" }]}
        />
        <ChartCard title="Events" description="All events per day" rows={overview?.series} series={[{ key: "totalEvents", label: "Events" }]} variant="bar" />
        <ChartCard title="Sessions" rows={overview?.series} series={[{ key: "sessions", label: "Sessions" }]} />
        <ChartCard title="Errors" rows={overview?.series} series={[{ key: "errorCount", label: "Errors" }]} variant="bar" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top events</CardTitle>
            <Link href={href("/events")} className="text-xs text-muted-foreground hover:text-foreground">
              Explore →
            </Link>
          </CardHeader>
          <CardContent>
            {topEvents ? (
              <BarList
                items={topEvents.events.map((e) => ({
                  key: e.eventName,
                  label: e.eventName,
                  value: e.totalEvents,
                  secondary: `${e.avgDailyUsers} users/day`,
                  href: href(`/events/${encodeURIComponent(e.eventName)}`),
                }))}
              />
            ) : (
              <Skeleton className="h-48" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unresolved errors</CardTitle>
            <Link href={href("/errors")} className="text-xs text-muted-foreground hover:text-foreground">
              All errors →
            </Link>
          </CardHeader>
          <CardContent>
            {errors === undefined ? (
              <Skeleton className="h-48" />
            ) : errors.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No unresolved errors in this range.</p>
            ) : (
              <ul className="divide-y">
                {errors.slice(0, 6).map((e) => (
                  <li key={e._id}>
                    <Link href={href(`/errors/${e._id}`)} className="flex items-center justify-between gap-3 py-2 hover:bg-accent/40">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{e.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {e.affectedUserCount} users · last {formatRelative(e.lastSeenAt)}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-sm">{formatNumber(e.occurrenceCount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
