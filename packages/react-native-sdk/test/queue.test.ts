import { describe, expect, test } from "vitest";
import { classify } from "../src/core/transport";
import { Backoff } from "../src/core/backoff";
import { EventQueue } from "../src/core/queue";
import { createMemoryStorage } from "../src/storage/memory";
import type { WireEvent } from "../src/core/types";

const logger = { debug: () => undefined, warn: () => undefined };
const event = (id: string, extra = ""): WireEvent => ({
  eventId: id,
  eventName: "feature_used",
  anonymousId: "anon_1",
  timestamp: 1,
  properties: extra ? { extra } : {},
});

describe("EventQueue", () => {
  test("discards the oldest events when full, never in-flight ones", () => {
    const queue = new EventQueue(createMemoryStorage(), "q", { maxQueueSize: 3, maxQueueBytes: 1e6, maxEventBytes: 1e5 }, logger);
    queue.enqueue(event("a"));
    queue.enqueue(event("b"));
    expect(queue.takeBatch(1).map((e) => e.eventId)).toEqual(["a"]);
    queue.enqueue(event("c"));
    queue.enqueue(event("d"));
    expect(queue.size).toBe(3);
    queue.release(["a"]);
    expect(queue.takeBatch(10).map((e) => e.eventId)).toEqual(["a", "c", "d"]);
  });

  test("enforces the byte budget and per-event limit", () => {
    const queue = new EventQueue(createMemoryStorage(), "q", { maxQueueSize: 100, maxQueueBytes: 400, maxEventBytes: 300 }, logger);
    expect(queue.enqueue(event("huge", "x".repeat(400)))).toBe(false);
    for (const id of ["a", "b", "c", "d", "e"]) queue.enqueue(event(id));
    expect(queue.size).toBeLessThan(5);
    expect(queue.takeBatch(10).at(-1)?.eventId).toBe("e");
  });

  test("coalesces writes and restores in order", async () => {
    const storage = createMemoryStorage();
    let writes = 0;
    const counting = { ...storage, setItem: (k: string, v: string) => (writes++, storage.setItem(k, v)) };
    const queue = new EventQueue(counting, "q", { maxQueueSize: 10, maxQueueBytes: 1e6, maxEventBytes: 1e5 }, logger);
    queue.enqueue(event("a"));
    queue.enqueue(event("b"));
    await Promise.resolve();
    expect(writes).toBe(1);

    const restored = new EventQueue(storage, "q", { maxQueueSize: 10, maxQueueBytes: 1e6, maxEventBytes: 1e5 }, logger);
    restored.enqueue(event("c"));
    await restored.load();
    expect(restored.takeBatch(10).map((e) => e.eventId)).toEqual(["a", "b", "c"]);
  });

  test("ignores corrupt persisted data", async () => {
    const storage = createMemoryStorage();
    storage.setItem("q", "{not json");
    const queue = new EventQueue(storage, "q", { maxQueueSize: 10, maxQueueBytes: 1e6, maxEventBytes: 1e5 }, logger);
    await queue.load();
    expect(queue.size).toBe(0);
  });
});

describe("classify", () => {
  test("maps responses to queue actions", () => {
    expect(classify(200, '{"accepted":1,"rejected":0,"duplicates":0}', null, logger).kind).toBe("settled");
    expect(classify(200, "oops", null, logger).kind).toBe("retry");
    expect(classify(500, "", null, logger).kind).toBe("retry");
    expect(classify(429, "", "30", logger)).toEqual({ kind: "retry", reason: "HTTP 429", retryAfterMs: 30_000 });
    expect(classify(413, "", null, logger).kind).toBe("split");
    expect(classify(401, "", null, logger).kind).toBe("unauthorized");
    expect(classify(400, "", null, logger).kind).toBe("drop");
  });
});

describe("Backoff", () => {
  test("grows exponentially up to the cap and resets on success", () => {
    const backoff = new Backoff(1000, 8000, () => 1);
    expect([0, 0, 0, 0, 0].map(() => backoff.failure(0))).toEqual([1000, 2000, 4000, 8000, 8000]);
    expect(backoff.canAttempt(7999)).toBe(false);
    backoff.success();
    expect(backoff.canAttempt(0)).toBe(true);
  });
});
