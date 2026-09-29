import { v, type Infer } from "convex/values";

export const propertyValue = v.union(v.string(), v.number(), v.boolean(), v.null());
export const properties = v.record(v.string(), propertyValue);

export const platform = v.union(v.literal("ios"), v.literal("android"), v.literal("web"), v.literal("other"));

export const eventContext = v.object({
  platform: v.optional(platform),
  appVersion: v.optional(v.string()),
  buildNumber: v.optional(v.string()),
  osVersion: v.optional(v.string()),
  deviceModel: v.optional(v.string()),
  locale: v.optional(v.string()),
  timezone: v.optional(v.string()),
  sdkVersion: v.optional(v.string()),
  screen: v.optional(v.string()),
});

/** Shape of an event after HTTP-level validation, as handed to the ingestion mutation. */
export const validatedEvent = v.object({
  eventId: v.string(),
  eventName: v.string(),
  anonymousId: v.string(),
  distinctId: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  timestamp: v.number(),
  properties,
  context: eventContext,
});

export const memberRole = v.union(v.literal("owner"), v.literal("member"));

export const errorStatus = v.union(v.literal("unresolved"), v.literal("resolved"), v.literal("ignored"));

export const insightConfig = v.object({
  eventNames: v.array(v.string()),
  metric: v.union(v.literal("total"), v.literal("unique")),
  days: v.number(),
});

export type Properties = Infer<typeof properties>;
export type EventContextValue = Infer<typeof eventContext>;
export type ValidatedEventValue = Infer<typeof validatedEvent>;
export type ErrorStatus = Infer<typeof errorStatus>;
