import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { makeEvent, NOW, postBatch, setupProject } from "./harness.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("POST /v1/batch", () => {
  test("stores events and acknowledges them", async () => {
    const { t, apiKey, projectId } = await setupProject();
    const { status, body } = await postBatch(t, apiKey, [makeEvent(), makeEvent({ eventName: "paywall_viewed" })]);
    expect(status).toBe(200);
    expect(body).toEqual({ accepted: 2, duplicates: 0, rejected: 0 });
    const stored = await t.run((ctx) => ctx.db.query("events").collect());
    expect(stored).toHaveLength(2);
    const project = await t.run((ctx) => ctx.db.get(projectId));
    expect(project?.firstEventAt).toBe(NOW);
  });

  test("retried batches are deduplicated by eventId", async () => {
    const { t, apiKey } = await setupProject();
    const events = [makeEvent(), makeEvent()];
    await postBatch(t, apiKey, events);
    const retry = await postBatch(t, apiKey, events);
    expect(retry.body).toEqual({ accepted: 0, duplicates: 2, rejected: 0 });
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(2);
    const [stats] = await t.run((ctx) => ctx.db.query("dailyProjectStats").collect());
    expect(stats?.totalEvents).toBe(2);
  });

  test("rejects invalid events individually and reports reasons", async () => {
    const { t, apiKey } = await setupProject();
    const { status, body } = await postBatch(t, apiKey, [
      makeEvent(),
      makeEvent({ eventName: "$made_up" }),
      makeEvent({ timestamp: NOW - 400 * 24 * 3600 * 1000 }),
      makeEvent({ properties: { nested: { a: 1 } as never } }),
      { eventName: "missing_fields" },
    ]);
    expect(status).toBe(200);
    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(4);
    expect((body.errors as Array<{ reason: string }>).map((e) => e.reason)).toEqual([
      "reserved_event_name",
      "timestamp_out_of_range",
      "invalid_properties",
      "invalid_event",
    ]);
  });

  test("corrects device clock skew using sentAt", async () => {
    const { t, apiKey } = await setupProject();
    const skew = 2 * 60 * 60 * 1000; // device clock 2h ahead
    await postBatch(t, apiKey, [makeEvent({ timestamp: NOW + skew - 1000 })], { sentAt: NOW + skew });
    const [event] = await t.run((ctx) => ctx.db.query("events").collect());
    expect(event?.timestamp).toBe(NOW - 1000);
  });

  test("request-level errors use status codes the SDK understands", async () => {
    const { t, apiKey, asUser, projectId } = await setupProject();
    expect((await postBatch(t, "proj_unknown", [makeEvent()])).status).toBe(401);

    const tooMany = Array.from({ length: 101 }, () => makeEvent());
    expect((await postBatch(t, apiKey, tooMany)).status).toBe(400);

    const malformed = await t.fetch("/v1/batch", { method: "POST", body: "{not json" });
    expect(malformed.status).toBe(400);

    const huge = await t.fetch("/v1/batch", { method: "POST", body: "x".repeat(600 * 1024) });
    expect(huge.status).toBe(413);

    const secondKeyId = await asUser.mutation(api.projects.apiKeys.create, { projectId, name: "CI" });
    const [first] = await asUser.query(api.projects.apiKeys.list, { projectId });
    await asUser.mutation(api.projects.apiKeys.setEnabled, { keyId: first!._id, enabled: false });
    expect((await postBatch(t, apiKey, [makeEvent()])).status).toBe(403);
    expect(secondKeyId).toBeDefined();
  });
});

describe("aggregates", () => {
  test("unique users are counted once per day, not once per event", async () => {
    const { t, apiKey } = await setupProject();
    await postBatch(t, apiKey, [makeEvent(), makeEvent(), makeEvent({ eventName: "paywall_viewed" })]);
    await postBatch(t, apiKey, [makeEvent(), makeEvent({ anonymousId: "anon_2", sessionId: "sess_2" })]);

    const [day] = await t.run((ctx) => ctx.db.query("dailyProjectStats").collect());
    expect(day).toMatchObject({ totalEvents: 5, activeUsers: 2, newUsers: 2, sessions: 2 });

    const eventStats = await t.run((ctx) => ctx.db.query("dailyEventStats").collect());
    const opened = eventStats.find((s) => s.eventName === "app_opened");
    expect(opened).toMatchObject({ totalEvents: 4, uniqueUsers: 2 });

    const periods = await t.run((ctx) => ctx.db.query("periodActiveUsers").collect());
    expect(periods.map((p) => [p.period, p.activeUsers]).sort()).toEqual([
      ["2026-09", 2],
      ["2026-W40", 2],
    ]);
  });

  test("release stats track sessions with errors", async () => {
    const { t, apiKey } = await setupProject();
    await postBatch(t, apiKey, [
      makeEvent(),
      makeEvent({ eventName: "$error", properties: { name: "TypeError", message: "x is undefined" } }),
      makeEvent({ eventName: "$error", properties: { name: "TypeError", message: "x is undefined" } }),
      makeEvent({ sessionId: "sess_2", context: { platform: "android", appVersion: "1.1.0" } }),
    ]);
    const releases = await t.run((ctx) => ctx.db.query("dailyReleaseStats").collect());
    const ios = releases.find((r) => r.platform === "ios");
    expect(ios).toMatchObject({ sessions: 1, sessionsWithErrors: 1, errorCount: 2, activeUsers: 1 });
    const [day] = await t.run((ctx) => ctx.db.query("dailyProjectStats").collect());
    expect(day).toMatchObject({ sessions: 2, sessionsWithErrors: 1, errorCount: 2 });
  });
});

describe("identity", () => {
  test("identify promotes the anonymous person instead of creating a second one", async () => {
    const { t, apiKey } = await setupProject();
    await postBatch(t, apiKey, [makeEvent({ eventName: "onboarding_started" })]);
    await postBatch(t, apiKey, [
      makeEvent({ eventName: "$identify", distinctId: "user_123", properties: { plan: "pro", email: "a@b.co" } }),
      makeEvent({ eventName: "plan_selected", distinctId: "user_123" }),
    ]);
    const people = await t.run((ctx) => ctx.db.query("people").collect());
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ distinctId: "user_123", properties: { plan: "pro", email: "a@b.co" } });
    const [day] = await t.run((ctx) => ctx.db.query("dailyProjectStats").collect());
    expect(day).toMatchObject({ activeUsers: 1, newUsers: 1 });
  });

  test("reset on a shared device keeps two users apart", async () => {
    const { t, apiKey } = await setupProject();
    await postBatch(t, apiKey, [makeEvent({ distinctId: "alice", anonymousId: "anon_a" })]);
    // After reset() the SDK generates a new anonymous id.
    await postBatch(t, apiKey, [makeEvent({ distinctId: "bob", anonymousId: "anon_b", sessionId: "sess_b" })]);
    const people = await t.run((ctx) => ctx.db.query("people").collect());
    expect(people.map((p) => p.distinctId).sort()).toEqual(["alice", "bob"]);
  });

  test("an anonymous id owned by an identified user is never re-assigned", async () => {
    const { t, apiKey } = await setupProject();
    await postBatch(t, apiKey, [makeEvent({ distinctId: "alice" })]);
    // App forgot to call reset(): same anonymous id, different user.
    await postBatch(t, apiKey, [makeEvent({ distinctId: "bob" })]);
    const people = await t.run((ctx) => ctx.db.query("people").collect());
    expect(people).toHaveLength(2);
    const alias = await t.run((ctx) => ctx.db.query("personAliases").collect());
    const alice = people.find((p) => p.distinctId === "alice")!;
    expect(alias).toHaveLength(1);
    expect(alias[0]?.personId).toBe(alice._id);
    expect(people.every((p) => p.mergedIntoId === undefined)).toBe(true);
  });

  test("logging in on a second device merges anonymous history into the existing person", async () => {
    const { t, apiKey } = await setupProject();
    await postBatch(t, apiKey, [makeEvent({ distinctId: "user_1", anonymousId: "anon_phone" })]);
    await postBatch(t, apiKey, [makeEvent({ anonymousId: "anon_tablet", sessionId: "sess_tablet", eventName: "signup_viewed" })]);
    await postBatch(t, apiKey, [makeEvent({ anonymousId: "anon_tablet", sessionId: "sess_tablet", distinctId: "user_1" })]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const people = await t.run((ctx) => ctx.db.query("people").collect());
    const target = people.find((p) => p.distinctId === "user_1")!;
    const merged = people.find((p) => p._id !== target._id)!;
    expect(merged.mergedIntoId).toBe(target._id);

    const events = await t.run((ctx) => ctx.db.query("events").collect());
    expect(events.every((e) => e.personId === target._id)).toBe(true);
    const sessions = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(sessions.every((s) => s.personId === target._id)).toBe(true);
  });
});

describe("sessions", () => {
  test("derive duration from events and tolerate a missing $session_end", async () => {
    const { t, apiKey, asUser, projectId } = await setupProject();
    await postBatch(t, apiKey, [
      makeEvent({ eventName: "$session_start", timestamp: NOW - 50_000 }),
      makeEvent({ eventName: "$screen", properties: { name: "Home" }, timestamp: NOW - 40_000 }),
      makeEvent({ eventName: "$screen", properties: { name: "Checkout" }, timestamp: NOW - 10_000 }),
    ]);
    const timeline = await asUser.query(api.sessions.queries.getSessionTimeline, { projectId, sessionId: "sess_1" });
    expect(timeline?.session).toMatchObject({ eventCount: 3, screenCount: 2, entryScreen: "Home", durationMs: 40_000 });
    expect(timeline?.events.map((e) => e.eventName)).toEqual(["$session_start", "$screen", "$screen"]);
  });
});

describe("errors", () => {
  const stack = [
    "TypeError: Cannot read property 'id' of undefined",
    "    at renderCheckout (address at index.android.bundle:1:1234)",
    "    at CheckoutScreen (/app/src/screens/Checkout.tsx:42:10)",
  ].join("\n");

  test("groups similar errors and counts affected users exactly", async () => {
    const { t, apiKey, asUser } = await setupProject();
    const error = (anonymousId: string, message: string) =>
      makeEvent({ anonymousId, eventName: "$error", properties: { name: "TypeError", message, stack, fatal: false } });

    await postBatch(t, apiKey, [error("anon_1", "Order 123 failed"), error("anon_1", "Order 456 failed")]);
    await postBatch(t, apiKey, [error("anon_2", "Order 789 failed"), error("anon_2", "Something else")]);

    const groups = await t.run((ctx) => ctx.db.query("errorGroups").collect());
    expect(groups).toHaveLength(2);
    const orderGroup = groups.find((g) => g.occurrenceCount === 3)!;
    expect(orderGroup).toMatchObject({ affectedUserCount: 2, status: "unresolved" });
    expect(orderGroup.culprit).toBe("renderCheckout (index.android.bundle)");

    const details = await asUser.query(api.errors.queries.getErrorDetails, { errorGroupId: orderGroup._id });
    expect(details.occurrences).toHaveLength(3);
    expect(details.versions).toEqual([expect.objectContaining({ key: "1.0.0", occurrences: 3 })]);
    expect(details.affectedUsers).toHaveLength(2);
  });

  test("a resolved error that happens again regresses to unresolved", async () => {
    const { t, apiKey, asUser } = await setupProject();
    const error = () => makeEvent({ eventName: "$error", properties: { name: "Error", message: "boom" } });
    await postBatch(t, apiKey, [error()]);
    const [group] = await t.run((ctx) => ctx.db.query("errorGroups").collect());
    await asUser.mutation(api.errors.mutations.setStatus, { errorGroupId: group!._id, status: "resolved" });
    vi.setSystemTime(NOW + 1000);
    await postBatch(t, apiKey, [makeEvent({ eventName: "$error", properties: { name: "Error", message: "boom" }, timestamp: NOW + 500 })], {
      sentAt: NOW + 1000,
    });
    const updated = await t.run((ctx) => ctx.db.get(group!._id));
    expect(updated?.status).toBe("unresolved");
  });
});
