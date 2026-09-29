import { utcDay, type WireEvent } from "@analytics/shared";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { makeEvent, NOW, postBatch, setupProject } from "./harness.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/**
 * Property-style check: ingest randomized traffic (including retries and
 * pre-login activity) and verify every aggregate against a brute-force
 * recount from the raw events table.
 */
test("aggregates always match a recount of raw events", async () => {
  const { t, apiKey } = await setupProject();
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const events: WireEvent[] = [];
  for (let user = 0; user < 25; user++) {
    const identifyAt = random() < 0.6 ? Math.floor(random() * 6) : -1;
    for (let session = 0; session < 3; session++) {
      const start = NOW - Math.floor(random() * 3) * 86_400_000 - 3_600_000 - Math.floor(random() * 600_000);
      for (let i = 0; i < 4; i++) {
        const index = session * 4 + i;
        events.push(
          makeEvent({
            anonymousId: `anon_${user}`,
            distinctId: identifyAt >= 0 && index >= identifyAt ? `user_${user}` : undefined,
            sessionId: `s_${user}_${session}`,
            eventName: random() < 0.1 ? "$error" : random() < 0.5 ? "$screen" : "feature_used",
            properties: { name: "Home", message: "boom" },
            timestamp: start + i * 1000,
            context: { platform: random() < 0.5 ? "ios" : "android", appVersion: "1.0.0" },
          }),
        );
      }
    }
  }
  // Shuffle, then send in batches; resend a few batches to simulate retries.
  events.sort(() => random() - 0.5);
  for (let i = 0; i < events.length; i += 37) {
    const batch = events.slice(i, i + 37);
    await postBatch(t, apiKey, batch);
    if (random() < 0.3) await postBatch(t, apiKey, batch);
  }

  const snapshot = await t.run(async (ctx) => ({
    events: await ctx.db.query("events").collect(),
    people: await ctx.db.query("people").collect(),
    sessions: await ctx.db.query("sessions").collect(),
    daily: await ctx.db.query("dailyProjectStats").collect(),
    eventDaily: await ctx.db.query("dailyEventStats").collect(),
  }));

  expect(snapshot.events).toHaveLength(events.length);
  // Anonymous-then-identified users on one device must stay a single person.
  expect(snapshot.people).toHaveLength(25);

  const sum = (key: "totalEvents" | "sessions" | "newUsers" | "errorCount") => snapshot.daily.reduce((a, d) => a + d[key], 0);
  expect(sum("totalEvents")).toBe(events.length);
  expect(sum("sessions")).toBe(snapshot.sessions.length);
  expect(sum("newUsers")).toBe(snapshot.people.length);
  expect(sum("errorCount")).toBe(snapshot.events.filter((e) => e.eventName === "$error").length);

  for (const day of snapshot.daily) {
    const people = new Set(snapshot.events.filter((e) => utcDay(e.timestamp) === day.date).map((e) => e.personId));
    expect(day.activeUsers).toBe(people.size);
  }
  for (const row of snapshot.eventDaily) {
    const matching = snapshot.events.filter((e) => utcDay(e.timestamp) === row.date && e.eventName === row.eventName);
    expect(row.totalEvents).toBe(matching.length);
    expect(row.uniqueUsers).toBe(new Set(matching.map((e) => e.personId)).size);
  }
  for (const session of snapshot.sessions) {
    const sessionEvents = snapshot.events.filter((e) => e.sessionId === session.sessionId);
    expect(session.eventCount).toBe(sessionEvents.length);
    expect(session.startedAt).toBe(Math.min(...sessionEvents.map((e) => e.timestamp)));
    expect(session.lastEventAt).toBe(Math.max(...sessionEvents.map((e) => e.timestamp)));
  }
});
