import { addDays, dayToTimestamp, DAY_MS, utcDay } from "@analytics/shared";
import { v } from "convex/values";

/** Dashboard date ranges are inclusive UTC day strings, matching aggregate buckets. */
export const dateRange = v.object({ from: v.string(), to: v.string() });

export const MAX_RANGE_DAYS = 366;

export interface DateRange {
  from: string;
  to: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Clamps and sanity-checks a client-supplied range so a query can never scan unbounded history. */
export function normalizeRange(range: DateRange): DateRange {
  if (!DAY_PATTERN.test(range.from) || !DAY_PATTERN.test(range.to)) {
    throw new Error("Invalid date range.");
  }
  let { from, to } = range;
  if (from > to) [from, to] = [to, from];
  const earliest = addDays(to, -(MAX_RANGE_DAYS - 1));
  if (from < earliest) from = earliest;
  return { from, to };
}

export function rangeToTimestamps(range: DateRange): { start: number; end: number } {
  return { start: dayToTimestamp(range.from), end: dayToTimestamp(range.to) + DAY_MS - 1 };
}

/** The equally long range immediately before `range`, for period-over-period comparisons. */
export function previousRange(range: DateRange): DateRange {
  const length = Math.round((dayToTimestamp(range.to) - dayToTimestamp(range.from)) / DAY_MS) + 1;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

export function today(now = Date.now()): string {
  return utcDay(now);
}
