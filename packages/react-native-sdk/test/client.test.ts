import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { config, createHarness, tick } from "./helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 29, 12));
});
afterEach(() => vi.useRealTimers());

describe("tracking", () => {
  test("track() queues locally without touching the network", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    h.client.track("paywall_viewed", { plan: "yearly", price: 49.99 });
    expect(h.server.requests).toHaveLength(0);
    await h.client.flush();
    const events = h.sentEvents();
    expect(events.map((e) => e.eventName)).toEqual(["$session_start", "paywall_viewed"]);
    const paywall = events[1]!;
    expect(paywall.properties).toEqual({ plan: "yearly", price: 49.99 });
    expect(paywall.context).toMatchObject({ platform: "ios", appVersion: "1.2.3" });
    expect(paywall.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(paywall.anonymousId).toMatch(/^anon_/);
    expect(paywall.sessionId).toMatch(/^sess_/);
    expect(h.server.requests[0]!.apiKey).toBe("proj_test");
  });

  test("calls made before storage is loaded are replayed with their original timestamps", async () => {
    const h = createHarness();
    const t0 = Date.now();
    h.client.track("app_opened");
    h.client.init(config);
    vi.setSystemTime(t0 + 5000);
    await tick();
    await h.client.flush();
    const opened = h.sentEvents().find((e) => e.eventName === "app_opened");
    expect(opened?.timestamp).toBe(t0);
  });

  test("flushes automatically at the size threshold and on the interval", async () => {
    const h = createHarness();
    h.client.init({ ...config, flushAt: 5 });
    await tick();
    for (let i = 0; i < 3; i++) h.client.track("feature_used");
    await tick();
    expect(h.server.requests).toHaveLength(0);
    h.client.track("feature_used");
    await tick(10);
    expect(h.server.requests).toHaveLength(1);

    h.client.track("feature_used");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.server.requests).toHaveLength(2);
  });

  test("flushes when the app goes to the background", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    h.client.track("message_sent");
    h.setAppState("background");
    await tick(10);
    expect(h.sentEvents().map((e) => e.eventName)).toContain("message_sent");
  });

  test("sanitizes properties and rejects reserved or invalid names", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    h.client.track("$screen");
    h.client.track("");
    h.client.track("checkout_started", {
      "Cart Size": 3,
      nested: { a: 1 },
      when: new Date(0),
      nan: Number.NaN,
      nothing: undefined,
    });
    await h.client.flush();
    const events = h.sentEvents().filter((e) => e.eventName !== "$session_start");
    expect(events).toHaveLength(1);
    expect(events[0]!.properties).toEqual({ Cart_Size: 3, nested: '{"a":1}', when: "1970-01-01T00:00:00.000Z" });
  });

  test("disabled SDK is a no-op", async () => {
    const h = createHarness();
    h.client.init({ ...config, enabled: false });
    h.client.track("app_opened");
    await h.client.flush();
    expect(h.server.requests).toHaveLength(0);
  });
});

describe("reliability", () => {
  test("keeps events on failure and retries with backoff", async () => {
    let fail = true;
    const h = createHarness({
      server: { respond: (req) => (fail ? { status: 503 } : { status: 200, body: { accepted: req.events.length, duplicates: 0, rejected: 0 } }) },
    });
    h.client.init(config);
    await tick();
    h.client.track("subscription_started");
    await h.client.flush();
    expect(h.server.requests).toHaveLength(1);

    // Backoff: the interval tick right after a failure doesn't hammer the server.
    fail = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(h.server.requests).toHaveLength(1);

    await h.client.flush();
    const retried = h.server.requests[1]!.events.map((e) => e.eventId);
    expect(retried).toEqual(h.server.requests[0]!.events.map((e) => e.eventId));
    await h.client.flush();
    expect(h.server.requests).toHaveLength(2);
  });

  test("network errors and malformed responses are retried, not dropped", async () => {
    let mode: "offline" | "garbage" | "ok" = "offline";
    const h = createHarness({
      server: {
        respond: (req) =>
          mode === "offline"
            ? new TypeError("Network request failed")
            : mode === "garbage"
              ? { status: 200, body: "<html>proxy</html>" }
              : { status: 200, body: { accepted: req.events.length, duplicates: 0, rejected: 0 } },
      },
    });
    h.client.init(config);
    await tick();
    h.client.track("call_started");
    await h.client.flush();
    mode = "garbage";
    await h.client.flush();
    mode = "ok";
    await h.client.flush();
    await h.client.flush();
    expect(h.server.requests).toHaveLength(3);
  });

  test("the queue survives an app restart", async () => {
    const offline = createHarness({ server: { respond: () => new TypeError("offline") } });
    offline.client.init(config);
    await tick();
    offline.client.track("onboarding_completed");
    await tick();
    offline.client.shutdown();

    const restarted = createHarness({ storage: offline.storage });
    restarted.client.init(config);
    await tick();
    await restarted.client.flush();
    const names = restarted.sentEvents().map((e) => e.eventName);
    expect(names).toContain("onboarding_completed");
    expect(restarted.client.getAnonymousId()).toBe(offline.client.getAnonymousId());
  });

  test("oversized batches are split", async () => {
    const h = createHarness({
      server: {
        respond: (req) =>
          req.events.length > 2 ? { status: 413 } : { status: 200, body: { accepted: req.events.length, duplicates: 0, rejected: 0 } },
      },
    });
    h.client.init({ ...config, flushAt: 100 });
    await tick();
    for (let i = 0; i < 5; i++) h.client.track("feature_used");
    await h.client.flush();
    const delivered = new Set(h.server.requests.filter((r) => r.events.length <= 2).flatMap((r) => r.events.map((e) => e.eventId)));
    expect(delivered.size).toBe(6);
  });

  test("an invalid key stops uploads but keeps events", async () => {
    const h = createHarness({ server: { respond: () => ({ status: 401, body: { error: "invalid_api_key" } }) } });
    h.client.init(config);
    await tick();
    h.client.track("app_opened");
    await h.client.flush();
    await h.client.flush();
    expect(h.server.requests).toHaveLength(1);
  });
});

describe("identity and sessions", () => {
  test("identify attaches the user id and sends traits once", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    const anonymousId = h.client.getAnonymousId();
    h.client.track("signup_viewed");
    h.client.identify("user_123", { plan: "pro" });
    h.client.track("plan_selected");
    await h.client.flush();
    const events = h.sentEvents();
    const identify = events.find((e) => e.eventName === "$identify")!;
    expect(identify).toMatchObject({ distinctId: "user_123", anonymousId, properties: { plan: "pro" } });
    expect(events.find((e) => e.eventName === "signup_viewed")?.distinctId).toBeUndefined();
    expect(events.find((e) => e.eventName === "plan_selected")).toMatchObject({ distinctId: "user_123", anonymousId });
  });

  test("reset() starts a new anonymous identity and session", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    h.client.identify("alice");
    const before = { anon: h.client.getAnonymousId(), session: h.client.getSessionId() };
    h.client.reset();
    h.client.identify("bob");
    await h.client.flush();
    expect(h.client.getAnonymousId()).not.toBe(before.anon);
    expect(h.client.getSessionId()).not.toBe(before.session);
    const bobEvents = h.sentEvents().filter((e) => e.distinctId === "bob");
    expect(bobEvents.every((e) => e.anonymousId !== before.anon)).toBe(true);
    expect(h.sentEvents().map((e) => e.eventName)).toContain("$session_end");
  });

  test("identifying a different user without reset still separates identities", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    h.client.identify("alice");
    const aliceAnon = h.client.getAnonymousId();
    h.client.identify("bob");
    expect(h.client.getAnonymousId()).not.toBe(aliceAnon);
  });

  test("a new session starts after 30 minutes of inactivity", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    h.client.track("app_opened");
    const first = h.client.getSessionId();
    vi.setSystemTime(Date.now() + 10 * 60_000);
    h.client.track("feature_used");
    expect(h.client.getSessionId()).toBe(first);
    vi.setSystemTime(Date.now() + 31 * 60_000);
    h.setAppState("active");
    expect(h.client.getSessionId()).not.toBe(first);
    await h.client.flush();
    const end = h.sentEvents().find((e) => e.eventName === "$session_end");
    expect(end?.sessionId).toBe(first);
  });
});

describe("errors", () => {
  test("error() captures name, message, stack and current screen", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    h.client.screen("Checkout");
    h.client.error(new TypeError("price is undefined"), { orderId: "o_1" });
    await h.client.flush();
    const error = h.sentEvents().find((e) => e.eventName === "$error")!;
    expect(error.properties).toMatchObject({
      name: "TypeError",
      message: "price is undefined",
      fatal: false,
      screen: "Checkout",
      orderId: "o_1",
    });
    expect(String(error.properties!.stack)).toContain("TypeError");
    expect(error.context?.screen).toBe("Checkout");
  });

  test("uncaught errors are captured as fatal and persisted immediately", async () => {
    const h = createHarness({ server: { respond: () => new TypeError("offline") } });
    h.client.init(config);
    await tick();
    h.throwUncaught(new Error("boom"));
    const persisted = JSON.parse(String(h.storage.getItem("analytics.queue"))) as Array<{ eventName: string; properties: { fatal: boolean } }>;
    expect(persisted.find((e) => e.eventName === "$error")?.properties.fatal).toBe(true);
  });

  test("optOut() stops collection and clears the queue", async () => {
    const h = createHarness();
    h.client.init(config);
    await tick();
    h.client.track("app_opened");
    h.client.optOut();
    h.client.track("feature_used");
    await h.client.flush();
    expect(h.server.requests).toHaveLength(0);
  });
});

describe("disabled builds", () => {
  test("enabled: false with no key stays silent and sends nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = createHarness();
    h.client.init({ apiKey: "", host: "", enabled: false });
    h.client.track("app_opened");
    await h.client.flush();
    expect(warn).not.toHaveBeenCalled();
    expect(h.server.requests).toHaveLength(0);
    warn.mockRestore();
  });
});
