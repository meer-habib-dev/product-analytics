import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { errorStatus, eventContext, insightConfig, memberRole, platform, properties } from "./lib/validators";

/**
 * Index rationale lives next to each index. Every index costs write
 * throughput on ingestion, so each one must serve a concrete query.
 * See docs/data-model.md for the full picture.
 */
export default defineSchema({
  // `users`, `authAccounts`, `authSessions`, ... from Convex Auth.
  ...authTables,

  projects: defineTable({
    name: v.string(),
    slug: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Set on the first ingested batch; drives the onboarding "waiting for first event" state. */
    firstEventAt: v.optional(v.number()),
  }),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    role: memberRole,
    createdAt: v.number(),
  })
    // Project switcher: "which projects can I see?"
    .index("by_user", ["userId"])
    // Authorization check on every dashboard query.
    .index("by_project_user", ["projectId", "userId"]),

  projectApiKeys: defineTable({
    projectId: v.id("projects"),
    key: v.string(),
    name: v.string(),
    enabled: v.boolean(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    // Ingestion resolves the key on every batch.
    .index("by_key", ["key"])
    // Settings page lists a project's keys.
    .index("by_project", ["projectId"]),

  events: defineTable({
    projectId: v.id("projects"),
    eventId: v.string(),
    eventName: v.string(),
    /** Resolved at ingestion so person/unique-user queries never have to re-run identity resolution. */
    personId: v.id("people"),
    anonymousId: v.string(),
    distinctId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    timestamp: v.number(),
    receivedAt: v.number(),
    properties,
    context: eventContext,
    errorGroupId: v.optional(v.id("errorGroups")),
  })
    // Idempotency: retried batches must not store an event twice.
    .index("by_project_event_id", ["projectId", "eventId"])
    // Live event explorer, newest first.
    .index("by_project_time", ["projectId", "timestamp"])
    // Explorer filtered by name, event detail pages, property breakdowns and funnel step scans.
    .index("by_project_name_time", ["projectId", "eventName", "timestamp"])
    // Person timeline. Person ids are globally unique, so no project prefix is needed.
    .index("by_person_time", ["personId", "timestamp"])
    // Session timeline.
    .index("by_project_session_time", ["projectId", "sessionId", "timestamp"])
    // Recent occurrences of an error group.
    .index("by_error_group_time", ["errorGroupId", "timestamp"]),
  // Deliberately no distinctId/anonymousId indexes: those resolve to a person first.

  eventDefinitions: defineTable({
    projectId: v.id("projects"),
    eventName: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    // Upsert at ingestion + event pickers / catalog sorted by name.
    .index("by_project_name", ["projectId", "eventName"]),

  people: defineTable({
    projectId: v.id("projects"),
    /** Absent while the person is anonymous. */
    distinctId: v.optional(v.string()),
    /** Only what the developer explicitly passed to `identify()`. */
    properties,
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    lastPlatform: v.optional(platform),
    lastAppVersion: v.optional(v.string()),
    /** Set when an anonymous person was merged into an identified one. */
    mergedIntoId: v.optional(v.id("people")),
    /** distinctId + email/name traits, for dashboard search. */
    searchText: v.string(),
  })
    // Identity resolution at ingestion.
    .index("by_project_distinct", ["projectId", "distinctId"])
    // People list, most recently active first.
    .index("by_project_last_seen", ["projectId", "lastSeenAt"])
    // Person timeline includes events recorded against persons merged into it.
    .index("by_merged_into", ["mergedIntoId"])
    .searchIndex("search_people", { searchField: "searchText", filterFields: ["projectId"] }),

  personAliases: defineTable({
    projectId: v.id("projects"),
    anonymousId: v.string(),
    personId: v.id("people"),
  })
    // Identity resolution at ingestion: anonymousId -> person.
    .index("by_project_anonymous", ["projectId", "anonymousId"])
    // "Devices / anonymous ids" on the person page.
    .index("by_person", ["personId"]),

  sessions: defineTable({
    projectId: v.id("projects"),
    sessionId: v.string(),
    personId: v.id("people"),
    anonymousId: v.string(),
    distinctId: v.optional(v.string()),
    startedAt: v.number(),
    /** Session end is derived from the last event, so sessions tolerate a missing `$session_end`. */
    lastEventAt: v.number(),
    endedAt: v.optional(v.number()),
    eventCount: v.number(),
    screenCount: v.number(),
    errorCount: v.number(),
    platform: v.optional(platform),
    appVersion: v.optional(v.string()),
    entryScreen: v.optional(v.string()),
  })
    // Upsert at ingestion + session detail page.
    .index("by_project_session", ["projectId", "sessionId"])
    // Sessions list, newest first.
    .index("by_project_started", ["projectId", "startedAt"])
    // Sessions tab on a person.
    .index("by_person_started", ["personId", "startedAt"]),

  funnels: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    conversionWindowMs: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  funnelSteps: defineTable({
    projectId: v.id("projects"),
    funnelId: v.id("funnels"),
    order: v.number(),
    eventName: v.string(),
    label: v.optional(v.string()),
    propertyFilter: v.optional(v.object({ key: v.string(), value: v.string() })),
  }).index("by_funnel_order", ["funnelId", "order"]),

  savedInsights: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    kind: v.literal("trend"),
    config: insightConfig,
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  errorGroups: defineTable({
    projectId: v.id("projects"),
    fingerprint: v.string(),
    title: v.string(),
    name: v.string(),
    message: v.string(),
    /** First meaningful application stack frame, used for grouping and display. */
    culprit: v.optional(v.string()),
    status: errorStatus,
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    occurrenceCount: v.number(),
    fatalCount: v.number(),
    affectedUserCount: v.number(),
    lastAppVersion: v.optional(v.string()),
    lastPlatform: v.optional(platform),
  })
    // Grouping lookup at ingestion.
    .index("by_project_fingerprint", ["projectId", "fingerprint"])
    // Errors list, most recent first.
    .index("by_project_last_seen", ["projectId", "lastSeenAt"]),

  /** One row per (error group, person): makes affectedUserCount exact and lists affected users. */
  errorGroupPeople: defineTable({
    errorGroupId: v.id("errorGroups"),
    personId: v.id("people"),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    occurrenceCount: v.number(),
  })
    .index("by_group_person", ["errorGroupId", "personId"])
    .index("by_group_last_seen", ["errorGroupId", "lastSeenAt"]),

  /** Occurrences per (group, platform, app version): powers version/platform breakdowns and filters. */
  errorGroupReleases: defineTable({
    projectId: v.id("projects"),
    errorGroupId: v.id("errorGroups"),
    platform: v.string(),
    appVersion: v.string(),
    occurrenceCount: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_group", ["errorGroupId", "platform", "appVersion"])
    .index("by_project_version", ["projectId", "appVersion"])
    .index("by_project_platform", ["projectId", "platform"]),

  errorGroupDailyStats: defineTable({
    errorGroupId: v.id("errorGroups"),
    date: v.string(),
    occurrences: v.number(),
  }).index("by_group_date", ["errorGroupId", "date"]),

  dailyProjectStats: defineTable({
    projectId: v.id("projects"),
    date: v.string(),
    totalEvents: v.number(),
    screenViews: v.number(),
    sessions: v.number(),
    sessionsWithErrors: v.number(),
    activeUsers: v.number(),
    newUsers: v.number(),
    errorCount: v.number(),
  }).index("by_project_date", ["projectId", "date"]),

  dailyEventStats: defineTable({
    projectId: v.id("projects"),
    date: v.string(),
    eventName: v.string(),
    totalEvents: v.number(),
    uniqueUsers: v.number(),
  })
    // Top events over a date range + ingestion upsert.
    .index("by_project_date_event", ["projectId", "date", "eventName"])
    // Trend for one event.
    .index("by_project_event_date", ["projectId", "eventName", "date"]),

  dailyReleaseStats: defineTable({
    projectId: v.id("projects"),
    date: v.string(),
    platform: v.string(),
    appVersion: v.string(),
    totalEvents: v.number(),
    sessions: v.number(),
    sessionsWithErrors: v.number(),
    activeUsers: v.number(),
    errorCount: v.number(),
  })
    .index("by_project_date_release", ["projectId", "date", "platform", "appVersion"]),

  /** Weekly/monthly active users; cannot be derived by summing daily uniques. */
  periodActiveUsers: defineTable({
    projectId: v.id("projects"),
    period: v.string(),
    activeUsers: v.number(),
  }).index("by_project_period", ["projectId", "period"]),

  /**
   * Dedupe markers that make unique-user counters exact: a counter is only
   * incremented when a (bucket, scope, person) marker is inserted for the
   * first time. Markers expire once no valid event can land in their bucket.
   */
  uniqueMarkers: defineTable({
    projectId: v.id("projects"),
    bucket: v.string(),
    scope: v.string(),
    personId: v.id("people"),
    expiresAt: v.number(),
  })
    .index("by_key", ["projectId", "bucket", "scope", "personId"])
    .index("by_expires", ["expiresAt"]),
});
