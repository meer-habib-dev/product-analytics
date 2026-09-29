import type { FunnelCalculation } from "@convex/funnels/calculate";
import { formatDuration, formatNumber, formatPercent } from "@/lib/format";

/**
 * Funnel as ranked horizontal bars. One entity type (steps), so one color;
 * every value is printed, so nothing depends on hover.
 */
export function FunnelChart({ steps }: { steps: FunnelCalculation["steps"] }) {
  const entered = steps[0]?.count ?? 0;
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step, i) => (
        <li key={i}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span className="min-w-0">
              <span className="mr-2 text-xs text-muted-foreground">{i + 1}</span>
              <span className="font-mono text-[13px]">{step.label}</span>
            </span>
            <span className="tabular flex items-baseline gap-3 text-xs text-muted-foreground">
              {i > 0 && (
                <>
                  <span>
                    {formatPercent(step.conversionFromPrevious)} from previous
                    {step.medianTimeFromPreviousMs !== null && ` · median ${formatDuration(step.medianTimeFromPreviousMs)}`}
                  </span>
                  {step.dropOffFromPrevious > 0 && <span>−{formatNumber(step.dropOffFromPrevious)} dropped</span>}
                </>
              )}
              <span className="text-sm font-medium text-foreground">{formatNumber(step.count)}</span>
              <span className="w-14 text-right text-sm text-foreground">{formatPercent(step.conversionFromStart)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-6 rounded bg-muted">
            <div
              className="h-6 rounded"
              style={{ width: `${entered ? Math.max((step.count / entered) * 100, step.count ? 0.5 : 0) : 0}%`, background: "var(--series-1)" }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
