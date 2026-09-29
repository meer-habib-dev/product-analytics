import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { action, internalQuery } from "../_generated/server";
import { dateRange, normalizeRange, rangeToTimestamps } from "../lib/ranges";
import type { Doc } from "../_generated/dataModel";
import { computeFunnel, type FunnelStepResult, type StepOccurrence } from "./compute";

const PAGE_SIZE = 4000;
/** Per-step cap on raw events scanned; results are flagged as truncated beyond this. */
const MAX_EVENTS_PER_STEP = 200_000;

const breakdownField = v.union(v.literal("appVersion"), v.literal("platform"));

export interface FunnelCalculation {
  funnelId: Doc<"funnels">["_id"];
  computedAt: number;
  truncated: boolean;
  steps: Array<FunnelStepResult & { eventName: string; label: string }>;
  breakdown: Array<{ value: string; counts: number[] }>;
}

/**
 * One page of compact (person, time, breakdown) tuples for a funnel step.
 * Pages keep each query well within Convex read limits; the action stitches them.
 */
export const stepEventsPage = internalQuery({
  args: {
    projectId: v.id("projects"),
    eventName: v.string(),
    start: v.number(),
    end: v.number(),
    breakdown: v.optional(breakdownField),
    propertyFilter: v.optional(v.object({ key: v.string(), value: v.string() })),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("events")
      .withIndex("by_project_name_time", (q) =>
        q.eq("projectId", args.projectId).eq("eventName", args.eventName).gte("timestamp", args.start).lte("timestamp", args.end),
      )
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE });

    const filter = args.propertyFilter;
    const items: StepOccurrence[] = [];
    for (const event of page.page) {
      if (filter && String(event.properties[filter.key] ?? "") !== filter.value) continue;
      items.push({
        personId: event.personId,
        timestamp: event.timestamp,
        breakdown: args.breakdown ? (event.context[args.breakdown] ?? "unknown") : undefined,
      });
    }
    return { items, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * Funnels are computed on demand from raw events (never during ingestion).
 * An action lets the scan span many paginated queries instead of one bounded one.
 */
export const calculateFunnel = action({
  args: {
    funnelId: v.id("funnels"),
    range: dateRange,
    breakdown: v.optional(breakdownField),
  },
  handler: async (ctx, args): Promise<FunnelCalculation> => {
    // Runs with the caller's identity, so this also enforces project access.
    const funnel: Doc<"funnels"> & { steps: Doc<"funnelSteps">[] } = await ctx.runQuery(api.funnels.queries.get, { funnelId: args.funnelId });
    const { start, end } = rangeToTimestamps(normalizeRange(args.range));
    const lastPossible = end + funnel.conversionWindowMs;

    let truncated = false;
    const steps: StepOccurrence[][] = [];
    for (const [index, step] of funnel.steps.entries()) {
      const occurrences: StepOccurrence[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: { items: StepOccurrence[]; cursor: string; isDone: boolean } = await ctx.runQuery(
          internal.funnels.calculate.stepEventsPage,
          {
            projectId: funnel.projectId,
            eventName: step.eventName,
            start,
            end: index === 0 ? end : lastPossible,
            breakdown: index === 0 ? args.breakdown : undefined,
            propertyFilter: step.propertyFilter,
            cursor,
          },
        );
        occurrences.push(...page.items);
        if (page.isDone) break;
        if (occurrences.length >= MAX_EVENTS_PER_STEP) {
          truncated = true;
          break;
        }
        cursor = page.cursor;
      }
      steps.push(occurrences);
    }

    const result = computeFunnel({ steps, start, end, conversionWindowMs: funnel.conversionWindowMs });
    return {
      funnelId: funnel._id,
      computedAt: Date.now(),
      truncated,
      steps: funnel.steps.map((step, i) => ({
        eventName: step.eventName,
        label: step.label ?? step.eventName,
        ...result.steps[i]!,
      })),
      breakdown: args.breakdown ? result.breakdown.slice(0, 20) : [],
    };
  },
});
