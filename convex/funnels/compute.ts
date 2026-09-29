/**
 * Pure funnel math, independent of Convex so it can be unit tested.
 *
 * Semantics (ordered funnel):
 * - A person enters when they perform step 1 inside the date range.
 * - Each later step must happen at or after the previous step and within
 *   `conversionWindowMs` of the step-1 event that started the attempt.
 * - A person may start several attempts; the one that gets furthest counts.
 * - Breakdowns (e.g. app version) use the value on the step-1 event of that attempt.
 */

export interface StepOccurrence {
  personId: string;
  timestamp: number;
  breakdown?: string;
}

export interface FunnelComputationInput {
  steps: StepOccurrence[][];
  start: number;
  end: number;
  conversionWindowMs: number;
}

export interface FunnelStepResult {
  count: number;
  conversionFromPrevious: number | null;
  conversionFromStart: number | null;
  dropOffFromPrevious: number;
  medianTimeFromPreviousMs: number | null;
}

export interface FunnelComputationResult {
  steps: FunnelStepResult[];
  breakdown: Array<{ value: string; counts: number[] }>;
}

const MAX_ATTEMPTS_PER_PERSON = 50;

export function computeFunnel(input: FunnelComputationInput): FunnelComputationResult {
  const stepCount = input.steps.length;
  if (stepCount === 0) return { steps: [], breakdown: [] };

  const entries = groupByPerson(input.steps[0]!.filter((o) => o.timestamp >= input.start && o.timestamp <= input.end));
  const laterSteps = input.steps.slice(1).map((occurrences) => timesByPerson(occurrences));

  const counts = new Array<number>(stepCount).fill(0);
  const durations: number[][] = Array.from({ length: stepCount }, () => []);
  const breakdown = new Map<string, number[]>();

  for (const [personId, attempts] of entries) {
    let best: { reached: number; times: number[]; breakdown?: string } | undefined;

    for (const attempt of attempts.slice(0, MAX_ATTEMPTS_PER_PERSON)) {
      const deadline = attempt.timestamp + input.conversionWindowMs;
      const times = [attempt.timestamp];
      for (const stepTimes of laterSteps) {
        const next = firstAtOrAfter(stepTimes.get(personId), times[times.length - 1]!);
        if (next === undefined || next > deadline) break;
        times.push(next);
      }
      if (!best || times.length > best.reached) best = { reached: times.length, times, breakdown: attempt.breakdown };
      if (best.reached === stepCount) break;
    }
    if (!best) continue;

    for (let i = 0; i < best.reached; i++) {
      counts[i]!++;
      if (i > 0) durations[i]!.push(best.times[i]! - best.times[i - 1]!);
    }
    const key = best.breakdown ?? "(none)";
    const row = breakdown.get(key) ?? new Array<number>(stepCount).fill(0);
    for (let i = 0; i < best.reached; i++) row[i]!++;
    breakdown.set(key, row);
  }

  return {
    steps: counts.map((count, i) => {
      const previous = i === 0 ? null : counts[i - 1]!;
      return {
        count,
        conversionFromPrevious: previous === null ? null : previous > 0 ? count / previous : 0,
        conversionFromStart: counts[0]! > 0 ? count / counts[0]! : null,
        dropOffFromPrevious: previous === null ? 0 : previous - count,
        medianTimeFromPreviousMs: i === 0 ? null : median(durations[i]!),
      };
    }),
    breakdown: [...breakdown.entries()]
      .map(([value, rowCounts]) => ({ value, counts: rowCounts }))
      .sort((a, b) => b.counts[0]! - a.counts[0]!),
  };
}

function groupByPerson(occurrences: StepOccurrence[]): Map<string, StepOccurrence[]> {
  const map = new Map<string, StepOccurrence[]>();
  for (const o of occurrences) {
    const list = map.get(o.personId);
    if (list) list.push(o);
    else map.set(o.personId, [o]);
  }
  for (const list of map.values()) list.sort((a, b) => a.timestamp - b.timestamp);
  return map;
}

function timesByPerson(occurrences: StepOccurrence[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const o of occurrences) {
    const list = map.get(o.personId);
    if (list) list.push(o.timestamp);
    else map.set(o.personId, [o.timestamp]);
  }
  for (const list of map.values()) list.sort((a, b) => a - b);
  return map;
}

/** Binary search for the earliest time >= `min` in a sorted list. */
export function firstAtOrAfter(sorted: number[] | undefined, min: number): number | undefined {
  if (!sorted || sorted.length === 0) return undefined;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < min) lo = mid + 1;
    else hi = mid;
  }
  return sorted[lo];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}
