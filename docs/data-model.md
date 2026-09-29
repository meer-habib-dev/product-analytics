# Data model

Schema: [`convex/schema.ts`](../convex/schema.ts). Raw events are the source of truth. Everything else is either identity/state derived from events, or an aggregate that exists so dashboard queries never scan the events table.

Every index costs ingestion write throughput, so each one maps to a specific query.

## Tables

### Accounts and projects

| Table | Purpose | Indexes (→ query) |
| --- | --- | --- |
| `users`, `auth*` | Convex Auth (email + password) | managed by Convex Auth |
| `projects` | One per app: `name`, `slug`, `createdAt`, `updatedAt`, `firstEventAt` (drives onboarding) | none: always fetched by id |
| `projectMembers` | `(projectId, userId, role)` | `by_user` → project switcher · `by_project_user` → authorization on every dashboard query |
| `projectApiKeys` | Public ingestion keys: `key`, `enabled`, `lastUsedAt` | `by_key` → key resolution per batch · `by_project` → settings page |

### Events

`events`: `projectId, eventId, eventName, personId, anonymousId, distinctId?, sessionId?, timestamp, receivedAt, properties, context, errorGroupId?`

| Index | Query |
| --- | --- |
| `by_project_event_id` | Idempotency check on ingestion |
| `by_project_time` | Live explorer, newest first |
| `by_project_name_time` | Explorer filtered by event, event detail page, property breakdown sample, funnel step scans |
| `by_person_time` | Person timeline (`personId` is globally unique, so no project prefix) |
| `by_project_session_time` | Session timeline |
| `by_error_group_time` | Recent occurrences of an error group |

There are deliberately **no** `distinctId` or `anonymousId` indexes on events. Those identifiers resolve to a person once, at ingestion, and `personId` is stored on the event. Funnels and unique counts therefore never need identity resolution at query time.

`properties` is a flat record of primitives. `context` is a typed object (platform, appVersion, buildNumber, osVersion, deviceModel, locale, timezone, sdkVersion, screen).

`eventDefinitions` `(projectId, eventName, firstSeenAt, lastSeenAt)`, index `by_project_name`: the event catalog and pickers. `lastSeenAt` is only rewritten when it is more than an hour stale, to avoid a hot row.

### Identity

| Table | Purpose | Indexes |
| --- | --- | --- |
| `people` | `distinctId?` (absent while anonymous), `properties` (only identify traits), first/last seen, last platform/version, `mergedIntoId?`, `searchText` | `by_project_distinct` → resolution · `by_project_last_seen` → people list · `by_merged_into` · search index `search_people` on `searchText` |
| `personAliases` | `anonymousId → personId` | `by_project_anonymous` → resolution · `by_person` → anonymous ids on the person page |

### Sessions

`sessions`: `sessionId, personId, anonymousId, distinctId?, startedAt, lastEventAt, endedAt?, eventCount, screenCount, errorCount, platform, appVersion, entryScreen`

Indexes: `by_project_session` (ingestion upsert, detail page) · `by_project_started` (list) · `by_person_started` (person page).

### Funnels and insights

`funnels` (`by_project`), `funnelSteps` (`by_funnel_order`), and `savedInsights` (`by_project`), with each saved insight's config stored as `{ eventNames, metric, days }`.

### Errors

| Table | Purpose | Indexes |
| --- | --- | --- |
| `errorGroups` | fingerprint, title, name, message, culprit frame, status, first/last seen, occurrence/fatal/affected-user counts, last release | `by_project_fingerprint` → grouping · `by_project_last_seen` → list |
| `errorGroupPeople` | one row per (group, person): exact affected users | `by_group_person` · `by_group_last_seen` |
| `errorGroupReleases` | occurrences per (group, platform, appVersion) | `by_group` → breakdowns · `by_project_version` / `by_project_platform` → list filters |
| `errorGroupDailyStats` | occurrences per group per day | `by_group_date` → timeline |

### Aggregates

| Table | Row key | Used by |
| --- | --- | --- |
| `dailyProjectStats` | (project, date) | Overview cards and charts |
| `dailyEventStats` | (project, date, eventName) | Top events (`by_project_date_event`), event trends (`by_project_event_date`) |
| `dailyReleaseStats` | (project, date, platform, appVersion) | Releases page |
| `periodActiveUsers` | (project, "2026-W40" or "2026-09") | WAU / MAU |
| `uniqueMarkers` | (project, bucket, scope, person) | Makes unique counters exact; expires via cron |

All buckets are **UTC** days, ISO weeks and months.

## Aggregation correctness

Counting rules:

- **Totals** (`totalEvents`, `errorCount`, `screenViews`) are plain increments.
- **Unique users** are *not* `+1 per event`. A counter is incremented only when a `(bucket, scope, personId)` marker is inserted for the first time:
  - daily active users: `(date, "active")`
  - weekly and monthly active users: `(2026-W40, "active")`, `(2026-09, "active")`, checked only when the person is new for the day
  - unique users per event per day: `(date, "event:<name>")`
  - active users per release per day: `(date, "release:<platform>:<version>")`
- **New users** are incremented when a person row is created, on the day of that first event. Promotion (anonymous → identified) doesn't create a person, so it isn't double-counted.
- **Sessions** are counted when a session row is created, on its start day. `sessionsWithErrors` is incremented when a session's `errorCount` goes from 0 to more than 0.
- `$session_end` counts as an event but doesn't make a user "active".

Range metrics that can't be summed are shown honestly: the overview shows *average* daily actives for a range and uses `periodActiveUsers` for WAU and MAU.

A marker expires `bucket length + 30 days + 1 day` after the event that created it. Ingestion rejects events older than 30 days, so no event can arrive after the marker it needs has expired.

`convex/tests/consistency.test.ts` ingests randomized traffic, including retried batches, and asserts that every aggregate equals a brute-force recount from raw events.

Known, documented approximations:

- When an anonymous person is **merged** into an existing identified person (login on a second device), activity from before the merge was already counted under the anonymous person. That day's unique counts can be +1, and `newUsers` counted the anonymous person. The merge re-points events, so funnels and timelines are exact afterwards.
- `avgDailyUsers` on top events and releases is an average of daily uniques, not a range-wide unique count.
