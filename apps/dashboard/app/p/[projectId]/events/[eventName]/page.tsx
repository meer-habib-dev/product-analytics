"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/analytics/empty-state";
import { EventRow } from "@/components/analytics/event-row";
import { StatCard } from "@/components/analytics/stat-card";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard } from "@/components/charts/chart-card";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateRange } from "@/lib/date-range";
import { formatNumber, formatRelative } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";

const CONTEXT_PROPERTIES = ["context.appVersion", "context.platform", "context.screen", "context.osVersion", "context.locale"];

export default function EventDetailsPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const eventName = decodeURIComponent(useParams<{ eventName: string }>().eventName);
  const { range } = useDateRange();
  const details = useQuery(api.analytics.events.getEventDetails, { projectId, eventName, range });
  const [property, setProperty] = useState<string | null>(null);
  const selected = property ?? details?.propertyKeys[0] ?? "context.appVersion";
  const breakdown = useQuery(
    api.analytics.events.getEventPropertyBreakdown,
    details ? { projectId, eventName, property: selected, range } : "skip",
  );

  if (details === null) {
    return <EmptyState title={`No "${eventName}" events yet`} description="Events appear here once your app sends them." />;
  }

  const days = details?.series.length ?? 1;
  const userDays = details?.series.reduce((a, d) => a + d.uniqueUsers, 0) ?? 0;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{eventName}</span>}
        description={details ? `First seen ${formatRelative(details.firstSeenAt)} · last seen ${formatRelative(details.lastSeenAt)}` : undefined}
        actions={
          <>
            <Link href={href("/events", { event: eventName })} className="text-sm text-muted-foreground hover:text-foreground">
              View in explorer →
            </Link>
            <DateRangePicker />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {details ? (
          <>
            <StatCard label="Total events" value={formatNumber(details.totalEvents)} />
            <StatCard label="Avg daily users" value={formatNumber(Math.round(userDays / days))} hint="Average of daily unique users" />
            <StatCard label="Events per user-day" value={userDays ? (details.totalEvents / userDays).toFixed(1) : "—"} />
            <StatCard label="Days with activity" value={`${details.series.filter((d) => d.totalEvents > 0).length}/${days}`} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[72px]" />)
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard
            title="Trend"
            description="Daily totals and daily unique users"
            rows={details?.series}
            series={[
              { key: "totalEvents", label: "Events", slot: 1 },
              { key: "uniqueUsers", label: "Unique users", slot: 2 },
            ]}
            height={260}
          />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Breakdown</CardTitle>
              <CardDescription>
                {breakdown ? `${breakdown.sampled ? "Sample of the latest" : "All"} ${formatNumber(breakdown.sampleSize)} events` : " "}
              </CardDescription>
            </div>
            <NativeSelect className="w-44" value={selected} onChange={(e) => setProperty(e.target.value)} aria-label="Property">
              {details?.propertyKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
              {CONTEXT_PROPERTIES.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </NativeSelect>
          </CardHeader>
          <CardContent>
            {breakdown ? (
              <BarList
                items={breakdown.values.map((v) => ({
                  key: v.value,
                  label: v.value,
                  value: v.count,
                  secondary: `${v.uniqueUsers} users`,
                }))}
              />
            ) : (
              <Skeleton className="h-48" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead>Event</TableHead>
                <TableHead>Person</TableHead>
                <TableHead className="hidden lg:table-cell">Properties</TableHead>
                <TableHead className="hidden md:table-cell">Release</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{details?.recent.map((event) => <EventRow key={event._id} event={event} />)}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
