# Architecture

## Goals, in priority order

1. Reliable event collection
2. Excellent React Native developer experience
3. Correct analytics
4. Simple architecture
5. Useful funnels and error tracking
6. A clean, fast dashboard
7. Privacy
8. Room to scale without building for scale that isn't there yet

## Components

| Piece | Responsibility |
| --- | --- |
| `@analytics/react-native` | Build events, persist them locally, upload in batches, manage identity and sessions, capture errors |
| `packages/shared` | The contract: wire types, limits, naming rules, validation, UTC date buckets. Used by the SDK, the backend and the seed script |
| `convex/` | Ingestion, storage, aggregation, analytics queries, auth |
| `apps/dashboard` | Presentation only. Every calculation happens in Convex functions |

## Event lifecycle

```
analytics.track("plan_selected", { plan: "yearly" })
  1. sanitize properties (flat primitives, safe keys, size limits)
  2. EventFactory assigns eventId (UUID v4), timestamp, anonymousId/distinctId, sessionId, context
  3. EventQueue appends in memory and schedules one coalesced MMKV write → returns immediately
  4. Uploader flushes at 20 queued events, every 10 s, on app background, or on flush()
  5. POST /v1/batch { apiKey, sentAt, events[≤50] }
  6. 200 → drop the batch · 5xx/timeout/offline/malformed → keep and back off · 413 → halve the batch · 401/403 → stop uploading, keep events
```

On the server (`convex/events/http.ts` → `convex/events/ingest.ts`):

```
HTTP action
  content-length / body size check (512 KB)
  JSON parse → envelope validation (≤ 100 events)
  resolve API key → project (internal query); unknown → 401, disabled → 403
  per-event validation + normalization (zod + rules in packages/shared/src/validation.ts)
     clock-skew correction: timestamp += receivedAt − sentAt
     timestamps accepted within [now − 30 d, now + 5 min]
  internal mutation ingestBatch (one transaction):
     for each event (timestamp order):
       dedupe on (projectId, eventId)
       resolve person (anonymous → identified promotion / merge rules)
       $error → fingerprint + error group upsert
       insert event
       update session state (in memory)
       count into in-memory aggregates; unique counters use dedupe markers
     write people, sessions, daily aggregates, event definitions once per row
  respond { accepted, duplicates, rejected, errors[] }
```

Nothing in ingestion scans history. Every read is a point lookup on an index. Funnels and breakdowns never run during ingestion.

## Idempotency

The SDK assigns `eventId` before the event is queued, so every retry carries the same id. The ingestion mutation checks the `by_project_event_id` index before inserting. Convex mutations are serializable transactions with optimistic concurrency. If two concurrent requests race to insert the same event, their read sets overlap, one transaction retries, and it then sees the other's insert. Duplicates are therefore impossible even when the same batch is in flight twice.

Duplicates inside a single batch are rejected during validation (`duplicate_in_batch`).

A 200 response means every event in the batch is settled: stored, already stored, or permanently rejected. That lets the SDK drop the whole batch without per-event bookkeeping.

## Identity

- First launch: the SDK generates `anon_<uuid>` and persists it.
- `identify(id)`: later events carry both `anonymousId` and `distinctId`.
- Server rules (`convex/people/identity.ts`):
  - If an anonymous person's `anonymousId` is first seen with a `distinctId`, that person is **promoted in place**, so pre-login and post-login activity (and unique counts) are one person.
  - If the `distinctId` already has a person (login on a second device), the anonymous person is **merged**. It is marked `mergedIntoId`, its alias is re-pointed, and a background job re-points its events and sessions.
  - An `anonymousId` that already belongs to an **identified** person is never re-assigned. This protects shared devices even when the app forgets to call `reset()`.
- `reset()` (logout) generates a new `anonymousId` and starts a new session. Identifying as a different user without `reset()` implies a reset in the SDK.

## Sessions

Sessions are created from events, not from lifecycle callbacks. A session starts on cold launch, or on activity or return to the foreground after 30 minutes of inactivity. The server keeps `startedAt`, `lastEventAt` and counts per session. Duration is `max(lastEventAt, endedAt) − startedAt`, so an app killed without a `$session_end` still produces a correct session. The SDK emits `$session_end` only when it knows the session ended (reset, or timeout detected in-process).

## Errors

`$error` events carry `name`, `message`, `stack`, `fatal` and `screen`. Uncaught JS errors are captured through React Native's `ErrorUtils` global handler, and the queue is persisted synchronously before the app dies. The fingerprint is computed on the server from:

- the normalized name,
- the normalized message (numbers, UUIDs, hex, URLs and quoted values stripped), and
- the first application stack frame (function plus file, **without line/column**, which change every build).

Groups track occurrences, exact affected users (`errorGroupPeople`), per-release counts (`errorGroupReleases`) and a daily timeline. A resolved group that recurs is automatically reopened.

Native crash symbolication is out of scope for V1.

## Real-time without scaling problems

- Overview, trends and releases read **daily aggregates**. Their cost is O(days in range) and independent of event volume, and they are reactive for free.
- The live event explorer is a **paginated** reactive query on `by_project_time`. Only the loaded page is subscribed, so new events appear instantly.
- Property breakdowns read a bounded sample (latest 3,000 events in range) and say so in the UI.
- Funnels are computed on demand by an **action** that pages through `by_project_name_time`, then runs pure funnel math (`convex/funnels/compute.ts`). They are deliberately not reactive.

## Privacy

The SDK automatically collects only: platform, OS version, app version and build, device model name, locale, timezone, SDK version and the current screen name. It never collects advertising IDs, device identifiers, location, contacts, clipboard, credentials or form/message contents. Person traits exist only when the developer passes them to `identify()`. `optOut()` stops collection and clears the queue, and the choice persists across restarts.

The ingestion key is public. It can only be exchanged, inside an internal query, for "may write events to project X". Dashboard access goes through Convex Auth plus per-project membership checks (`convex/lib/authz.ts`).

## Scaling path

V1 targets many apps, each with thousands to low millions of events per day. The known pressure points, and what to do about each **when measurements say so**:

| Pressure point | Symptom | Next step |
| --- | --- | --- |
| Hot aggregate rows (today's `dailyProjectStats`) under heavy concurrent ingestion | OCC retries / slower ingestion | Aggregates are already batched to one write per row per request. Next: shard counters (`@convex-dev/sharded-counter`) or move aggregation into a scheduled rollup |
| Funnel scans over very large ranges | Action time, `truncated` flag | Pre-aggregate per-person first-occurrence tables, or add sampling |
| `uniqueMarkers` table growth | Storage | Already expires rows via an hourly cron. Could switch to HyperLogLog sketches if approximate uniques are acceptable |
| Raw event retention | Storage cost | Add per-project retention with a cron that deletes old events in batches (aggregates keep history) |
| Abuse of a public key | Unwanted writes | Disable or rotate the key in Settings. Add per-key rate limiting (`@convex-dev/rate-limiter`) |
