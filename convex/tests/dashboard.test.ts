import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { makeEvent, NOW, postBatch, setupProject } from "./harness.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const range = { from: "2026-09-23", to: "2026-09-29" };

describe("authorization", () => {
  test("non-members cannot read a project", async () => {
    const { t, projectId } = await setupProject();
    const otherUserId = await t.run((ctx) => ctx.db.insert("users", {}));
    const stranger = t.withIdentity({ subject: `${otherUserId}|s` });
    await expect(stranger.query(api.analytics.overview.getOverviewMetrics, { projectId, range })).rejects.toThrow();
    await expect(t.query(api.projects.queries.listMine, {})).rejects.toThrow();
  });
});

describe("dashboard queries", () => {
  test("overview reads aggregates for the range", async () => {
    const { t, apiKey, asUser, projectId } = await setupProject();
    await postBatch(t, apiKey, [makeEvent(), makeEvent({ eventName: "$screen", properties: { name: "Home" } })]);
    const overview = await asUser.query(api.analytics.overview.getOverviewMetrics, { projectId, range });
    expect(overview.series).toHaveLength(7);
    expect(overview.totals).toMatchObject({ events: 2, screenViews: 1, sessions: 1, newUsers: 1 });
    expect(overview.activeUsers).toMatchObject({ daily: 1, weekly: 1, monthly: 1 });
  });

  test("top events, trend and property breakdown", async () => {
    const { t, apiKey, asUser, projectId } = await setupProject();
    await postBatch(t, apiKey, [
      makeEvent({ eventName: "plan_selected", properties: { plan: "yearly" } }),
      makeEvent({ eventName: "plan_selected", properties: { plan: "yearly" } }),
      makeEvent({ eventName: "plan_selected", properties: { plan: "monthly" }, anonymousId: "anon_2" }),
      makeEvent({ eventName: "app_opened" }),
    ]);
    const top = await asUser.query(api.analytics.events.getTopEvents, { projectId, range });
    expect(top.events[0]).toMatchObject({ eventName: "plan_selected", totalEvents: 3 });

    const trend = await asUser.query(api.analytics.events.getEventTrend, { projectId, range, eventNames: ["plan_selected"] });
    expect(trend.points.at(-1)?.values.plan_selected).toEqual({ total: 3, unique: 2 });

    const breakdown = await asUser.query(api.analytics.events.getEventPropertyBreakdown, {
      projectId,
      range,
      eventName: "plan_selected",
      property: "plan",
    });
    expect(breakdown.values).toEqual([
      { value: "yearly", count: 2, uniqueUsers: 1 },
      { value: "monthly", count: 1, uniqueUsers: 1 },
    ]);
  });

  test("event explorer paginates newest first and filters by name", async () => {
    const { t, apiKey, asUser, projectId } = await setupProject();
    await postBatch(t, apiKey, [makeEvent({ eventName: "a_event" }), makeEvent({ eventName: "b_event" })]);
    const all = await asUser.query(api.events.queries.listEvents, { projectId, paginationOpts: { numItems: 10, cursor: null } });
    expect(all.page.map((e) => e.eventName)).toEqual(["b_event", "a_event"]);
    const filtered = await asUser.query(api.events.queries.listEvents, {
      projectId,
      eventName: "a_event",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(filtered.page.map((e) => e.eventName)).toEqual(["a_event"]);
  });

  test("funnel calculation with version breakdown", async () => {
    const { t, apiKey, asUser, projectId } = await setupProject();
    const user = (anonymousId: string, appVersion: string, steps: string[]) =>
      steps.map((eventName, i) =>
        makeEvent({ anonymousId, sessionId: anonymousId, eventName, timestamp: NOW - 100_000 + i * 1000, context: { platform: "ios", appVersion } }),
      );
    await postBatch(t, apiKey, [
      ...user("anon_1", "1.0.0", ["paywall_viewed", "plan_selected", "subscription_started"]),
      ...user("anon_2", "1.0.0", ["paywall_viewed", "plan_selected"]),
      ...user("anon_3", "1.1.0", ["paywall_viewed"]),
      ...user("anon_4", "1.1.0", ["plan_selected", "subscription_started"]),
    ]);
    const funnelId = await asUser.mutation(api.funnels.mutations.create, {
      projectId,
      name: "Paywall conversion",
      conversionWindowMs: 24 * 3600 * 1000,
      steps: [{ eventName: "paywall_viewed" }, { eventName: "plan_selected" }, { eventName: "subscription_started" }],
    });
    const result = await asUser.action(api.funnels.calculate.calculateFunnel, { funnelId, range, breakdown: "appVersion" });
    expect(result.steps.map((s) => s.count)).toEqual([3, 2, 1]);
    expect(result.breakdown).toEqual([
      { value: "1.0.0", counts: [2, 2, 1] },
      { value: "1.1.0", counts: [1, 0, 0] },
    ]);
  });

  test("people list and person timeline", async () => {
    const { t, apiKey, asUser, projectId } = await setupProject();
    await postBatch(t, apiKey, [
      makeEvent({ eventName: "$identify", distinctId: "user_9", properties: { email: "nine@example.com" } }),
      makeEvent({ eventName: "message_sent", distinctId: "user_9" }),
    ]);
    const people = await asUser.query(api.people.queries.getPeople, { projectId, paginationOpts: { numItems: 10, cursor: null } });
    expect(people.page).toEqual([expect.objectContaining({ distinctId: "user_9", email: "nine@example.com" })]);
    const personId = people.page[0]!._id;
    const person = await asUser.query(api.people.queries.getPerson, { personId });
    expect(person.anonymousIds).toEqual(["anon_1"]);
    const timeline = await asUser.query(api.people.queries.getPersonTimeline, {
      personId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(timeline.page.map((e) => e.eventName)).toEqual(["message_sent", "$identify"]);
  });

  test("releases summarize health per version", async () => {
    const { t, apiKey, asUser, projectId } = await setupProject();
    await postBatch(t, apiKey, [
      makeEvent({ context: { platform: "ios", appVersion: "2.0.0" } }),
      makeEvent({ sessionId: "s2", context: { platform: "ios", appVersion: "2.1.0" } }),
      makeEvent({ sessionId: "s2", eventName: "$error", properties: { message: "x" }, context: { platform: "ios", appVersion: "2.1.0" } }),
    ]);
    const { releases } = await asUser.query(api.analytics.releases.getReleases, { projectId, range });
    expect(releases.map((r) => [r.appVersion, r.errorFreeSessionRate])).toEqual([
      ["2.1.0", 0],
      ["2.0.0", 1],
    ]);
  });
});
