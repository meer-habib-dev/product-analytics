"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunnelCalculation } from "@convex/funnels/calculate";
import { useAction, useMutation, useQuery } from "convex/react";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FunnelBuilder } from "@/components/analytics/funnel-builder";
import { StatCard } from "@/components/analytics/stat-card";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateRange } from "@/lib/date-range";
import { formatDuration, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";

type Breakdown = "appVersion" | "platform" | "";

export default function FunnelPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const router = useRouter();
  const funnelId = useParams<{ funnelId: string }>().funnelId as Id<"funnels">;
  const funnel = useQuery(api.funnels.queries.get, { funnelId });
  const calculate = useAction(api.funnels.calculate.calculateFunnel);
  const remove = useMutation(api.funnels.mutations.remove);
  const { range } = useDateRange();
  const [breakdown, setBreakdown] = useState<Breakdown>("appVersion");
  const [result, setResult] = useState<FunnelCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Funnels are computed on demand (an action), not a live query: they scan raw events.
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await calculate({ funnelId, range, breakdown: breakdown || undefined }));
    } catch {
      setError("Could not calculate this funnel.");
    } finally {
      setLoading(false);
    }
  }, [calculate, funnelId, range, breakdown]);

  useEffect(() => {
    if (funnel) void run();
  }, [run, funnel?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (funnel === undefined) return <Skeleton className="h-96" />;

  const last = result?.steps.at(-1);
  const first = result?.steps[0];

  return (
    <>
      <PageHeader
        title={funnel.name}
        description={`Conversion window ${formatDuration(funnel.conversionWindowMs)} · ${funnel.steps.length} steps`}
        actions={
          <>
            <DateRangePicker />
            <Button variant="outline" size="icon" aria-label="Recalculate" onClick={() => void run()} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
            <Button variant="outline" size="icon" aria-label="Edit funnel" onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Delete funnel"
              onClick={() => {
                if (confirm(`Delete funnel "${funnel.name}"?`)) void remove({ funnelId }).then(() => router.push(href("/funnels")));
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Entered" value={first ? formatNumber(first.count) : "—"} />
        <StatCard label="Completed" value={last ? formatNumber(last.count) : "—"} />
        <StatCard label="Overall conversion" value={formatPercent(last?.conversionFromStart)} />
        <StatCard
          label="Median time to convert"
          value={formatDuration(
            result && result.steps.every((s, i) => i === 0 || s.medianTimeFromPreviousMs !== null)
              ? result.steps.reduce((a, s) => a + (s.medianTimeFromPreviousMs ?? 0), 0)
              : null,
          )}
          hint="Sum of median times between consecutive steps"
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Steps</CardTitle>
            <CardDescription>{result ? `Computed ${formatRelative(result.computedAt)}${result.truncated ? " · capped scan, results approximate" : ""}` : " "}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-status-critical">{error}</p>
          ) : result ? (
            <FunnelChart steps={result.steps} />
          ) : (
            <Skeleton className="h-48" />
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Breakdown</CardTitle>
            <CardDescription>Did a release improve or hurt conversion? Grouped by the value on each person's first step.</CardDescription>
          </div>
          <NativeSelect className="w-40" value={breakdown} onChange={(e) => setBreakdown(e.target.value as Breakdown)} aria-label="Breakdown">
            <option value="appVersion">App version</option>
            <option value="platform">Platform</option>
            <option value="">None</option>
          </NativeSelect>
        </CardHeader>
        <CardContent>
          {breakdown && result && result.breakdown.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{breakdown === "appVersion" ? "Version" : "Platform"}</TableHead>
                  {result.steps.map((s, i) => (
                    <TableHead key={i} className="text-right font-mono">
                      {i + 1}. {s.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.breakdown.map((row) => (
                  <TableRow key={row.value}>
                    <TableCell className="font-medium">{row.value}</TableCell>
                    {row.counts.map((count, i) => (
                      <TableCell key={i} className="tabular text-right">
                        {formatNumber(count)}
                      </TableCell>
                    ))}
                    <TableCell className="tabular text-right font-medium">
                      {formatPercent(row.counts[0] ? row.counts[row.counts.length - 1]! / row.counts[0] : null)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{breakdown ? "No data for this range." : "Choose a breakdown to compare segments."}</p>
          )}
        </CardContent>
      </Card>

      {editing && <FunnelBuilder projectId={projectId} funnel={funnel} open={editing} onOpenChange={setEditing} />}
    </>
  );
}
