"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendChart, type TrendSeries } from "./trend-chart";

type Row = { date: string } & Record<string, number | string>;

/** A trend chart with a table view, so values are never readable only via hover. */
export function ChartCard({
  title,
  description,
  rows,
  series,
  variant,
  height,
  actions,
  formatValue = formatNumber,
}: {
  title: string;
  description?: ReactNode;
  rows: Row[] | undefined;
  series: TrendSeries[];
  variant?: "line" | "bar";
  height?: number;
  actions?: ReactNode;
  formatValue?: (value: number) => string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn("rounded px-2 py-0.5 capitalize text-muted-foreground", view === v && "bg-accent text-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows === undefined ? (
          <Skeleton className="w-full" style={{ height: height ?? 220 }} />
        ) : view === "chart" ? (
          <TrendChart data={rows} series={series} variant={variant} height={height} formatValue={formatValue} />
        ) : (
          <div className="overflow-y-auto" style={{ maxHeight: height ?? 220 }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {series.map((s) => (
                    <TableHead key={s.key} className="text-right">
                      {s.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].reverse().map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{formatDay(row.date)}</TableCell>
                    {series.map((s) => (
                      <TableCell key={s.key} className="tabular text-right">
                        {formatValue(Number(row[s.key] ?? 0))}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
