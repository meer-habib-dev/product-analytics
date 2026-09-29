"use client";

import { addDays, utcDay } from "@analytics/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export const RANGE_PRESETS = [
  { key: "1d", label: "Today", days: 1 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "14d", label: "Last 14 days", days: 14 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"];
const DEFAULT_RANGE: RangeKey = "14d";

export function rangeForPreset(key: RangeKey, now = Date.now()) {
  const preset = RANGE_PRESETS.find((p) => p.key === key) ?? RANGE_PRESETS[2];
  const to = utcDay(now);
  return { from: addDays(to, -(preset.days - 1)), to };
}

/** The global date range lives in the URL so views are shareable and survive reloads. */
export function useDateRange() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("range");
  const key: RangeKey = RANGE_PRESETS.some((p) => p.key === raw) ? (raw as RangeKey) : DEFAULT_RANGE;
  // Recomputed per day, not per render, so query args stay stable and cached.
  const today = utcDay(Date.now());
  const range = useMemo(() => rangeForPreset(key), [key, today]);

  const setKey = useCallback(
    (next: RangeKey) => {
      const search = new URLSearchParams(params.toString());
      search.set("range", next);
      router.replace(`${pathname}?${search.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return { key, range, setKey };
}
