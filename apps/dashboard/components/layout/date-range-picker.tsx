"use client";

import { RANGE_PRESETS, useDateRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";

export function DateRangePicker() {
  const { key, setKey } = useDateRange();
  return (
    <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-md border bg-card p-0.5">
      {RANGE_PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          role="radio"
          aria-checked={key === preset.key}
          title={preset.label}
          onClick={() => setKey(preset.key)}
          className={cn(
            "rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
            key === preset.key && "bg-accent font-medium text-foreground",
          )}
        >
          {preset.key === "1d" ? "Today" : preset.key}
        </button>
      ))}
    </div>
  );
}
