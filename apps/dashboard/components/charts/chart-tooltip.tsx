import { formatDay, formatNumber } from "@/lib/format";

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}

/** Shared tooltip: date heading, then one row per series with a color key and a text-colored value. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue = formatNumber,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatValue?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label) ? formatDay(label) : label}</div>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="tabular font-medium">{formatValue(Number(entry.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}
