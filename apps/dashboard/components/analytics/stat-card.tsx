import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Headline number with an optional period-over-period change. `higherIsBetter`
 * decides whether an increase reads as good (users) or bad (errors).
 */
export function StatCard({
  label,
  value,
  change,
  higherIsBetter = true,
  hint,
}: {
  label: string;
  value: ReactNode;
  change?: number | null;
  higherIsBetter?: boolean;
  hint?: string;
}) {
  const good = change !== null && change !== undefined && change !== 0 && change > 0 === higherIsBetter;
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted-foreground" title={hint}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {change !== undefined && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {change === null ? (
            <span>no prior data</span>
          ) : (
            <>
              <span className={cn("flex items-center font-medium", good ? "text-delta-good" : change !== 0 && "text-status-critical")}>
                {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {formatPercent(Math.abs(change), 0)}
              </span>
              <span>vs previous period</span>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
