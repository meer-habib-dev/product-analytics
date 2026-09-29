"use client";

import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { seriesColor } from "@/components/charts/trend-chart";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { type RangeKey, useDateRange } from "@/lib/date-range";
import { useProjectId } from "@/lib/hooks";

const MAX_SERIES = 4;
const DAYS_TO_RANGE: Record<number, RangeKey> = { 7: "7d", 14: "14d", 30: "30d", 90: "90d" };
const RANGE_TO_DAYS: Partial<Record<RangeKey, number>> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };

type Selection = { eventName: string; slot: number };

/** Each event keeps the color slot it was given while selected; removing one never repaints the rest. */
function nextSlot(selected: Selection[]): number {
  for (let slot = 1; slot <= 8; slot++) if (!selected.some((s) => s.slot === slot)) return slot;
  return 1;
}

export default function InsightsPage() {
  const projectId = useProjectId();
  const { key: rangeKey, range, setKey } = useDateRange();
  const definitions = useQuery(api.analytics.events.listEventDefinitions, { projectId });
  const saved = useQuery(api.analytics.insights.list, { projectId });
  const createInsight = useMutation(api.analytics.insights.create);
  const removeInsight = useMutation(api.analytics.insights.remove);
  const [selected, setSelected] = useState<Selection[]>([]);
  const [metric, setMetric] = useState<"total" | "unique">("total");
  const [name, setName] = useState("");

  const eventNames = useMemo(() => selected.map((s) => s.eventName), [selected]);
  const trend = useQuery(api.analytics.events.getEventTrend, eventNames.length ? { projectId, range, eventNames } : "skip");

  const rows = trend?.points.map((p) => ({
    date: p.date,
    ...Object.fromEntries(Object.entries(p.values).map(([n, v]) => [n, metric === "total" ? v.total : v.unique])),
  }));

  function load(insight: Doc<"savedInsights">) {
    setSelected(insight.config.eventNames.map((eventName, i) => ({ eventName, slot: i + 1 })));
    setMetric(insight.config.metric);
    setName(insight.name);
    const presetKey = DAYS_TO_RANGE[insight.config.days];
    if (presetKey) setKey(presetKey);
  }

  const days = RANGE_TO_DAYS[rangeKey] ?? 14;

  return (
    <>
      <PageHeader title="Insights" description="Compare event trends and save the views you check often." actions={<DateRangePicker />} />
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 pt-4">
              {selected.map((s) => (
                <span key={s.eventName} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs">
                  <span className="h-0.5 w-3 rounded" style={{ background: seriesColor(s.slot) }} />
                  {s.eventName}
                  <button type="button" aria-label={`Remove ${s.eventName}`} onClick={() => setSelected(selected.filter((x) => x !== s))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {selected.length < MAX_SERIES && (
                <NativeSelect
                  className="w-52"
                  value=""
                  aria-label="Add event"
                  onChange={(e) => e.target.value && setSelected([...selected, { eventName: e.target.value, slot: nextSlot(selected) }])}
                >
                  <option value="">+ Add event</option>
                  {definitions
                    ?.filter((d) => !eventNames.includes(d.eventName))
                    .map((d) => (
                      <option key={d.eventName} value={d.eventName}>
                        {d.eventName}
                      </option>
                    ))}
                </NativeSelect>
              )}
              <NativeSelect className="ml-auto w-44" value={metric} onChange={(e) => setMetric(e.target.value as "total" | "unique")} aria-label="Metric">
                <option value="total">Total events</option>
                <option value="unique">Daily unique users</option>
              </NativeSelect>
            </CardContent>
          </Card>
          {selected.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">Add one or more events to see their trend.</CardContent>
            </Card>
          ) : (
            <ChartCard
              title={metric === "total" ? "Total events per day" : "Unique users per day"}
              rows={rows}
              series={selected.map((s) => ({ key: s.eventName, label: s.eventName, slot: s.slot }))}
              height={320}
            />
          )}
          {selected.length > 0 && (
            <form
              className="flex max-w-md gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void createInsight({ projectId, name, config: { eventNames, metric, days } }).then(() => setName(""));
              }}
            >
              <Input placeholder="Name this insight" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              <Button type="submit" variant="outline" disabled={!name.trim()}>
                Save
              </Button>
            </form>
          )}
        </div>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Saved insights</CardTitle>
          </CardHeader>
          <CardContent>
            {saved?.length ? (
              <ul className="flex flex-col gap-1">
                {saved.map((insight) => (
                  <li key={insight._id} className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => load(insight)}>
                      <div className="truncate text-sm">{insight.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{insight.config.eventNames.join(", ")}</div>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete insight"
                      className="text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                      onClick={() => void removeInsight({ insightId: insight._id })}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
