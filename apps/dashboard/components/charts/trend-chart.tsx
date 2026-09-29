"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAxisNumber, formatDay, formatNumber } from "@/lib/format";
import { ChartTooltip } from "./chart-tooltip";

export interface TrendSeries {
  key: string;
  label: string;
  /** Fixed categorical slot (1-8). Bound to the entity, never to its rank, so filtering never repaints survivors. */
  slot?: number;
}

type Row = { date: string } & Record<string, number | string>;

const axisProps = {
  stroke: "var(--chart-axis)",
  tick: { fill: "var(--chart-muted)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export function seriesColor(slot = 1): string {
  return `var(--series-${((slot - 1) % 8) + 1})`;
}

/**
 * Daily trend over a date range. One y-axis only; a single series needs no
 * legend (the card title names it), two or more get a legend row above.
 */
export function TrendChart({
  data,
  series,
  variant = "line",
  height = 220,
  formatValue = formatNumber,
}: {
  data: Row[];
  series: TrendSeries[];
  variant?: "line" | "bar";
  height?: number;
  formatValue?: (value: number) => string;
}) {
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
  const grid = <CartesianGrid vertical={false} stroke="var(--chart-grid)" />;
  const xAxis = <XAxis dataKey="date" {...axisProps} tickFormatter={formatDay} minTickGap={24} />;
  const yAxis = <YAxis {...axisProps} tickFormatter={formatAxisNumber} allowDecimals={false} width={40} />;
  const tooltip = <Tooltip content={<ChartTooltip formatValue={formatValue} />} cursor={{ stroke: "var(--chart-axis)", fill: "var(--accent)" }} />;

  return (
    <div>
      {series.length > 1 && <Legend series={series} />}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {variant === "bar" ? (
            <BarChart {...common} barCategoryGap={2}>
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(s.slot)} radius={[4, 4, 0, 0]} maxBarSize={24} />
              ))}
            </BarChart>
          ) : (
            <LineChart {...common}>
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="monotone"
                  stroke={seriesColor(s.slot)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ series }: { series: TrendSeries[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded" style={{ background: seriesColor(s.slot) }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
