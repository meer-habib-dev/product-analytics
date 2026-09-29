import { describe, expect, test } from "vitest";
import { normalizePropertyKey } from "./naming";
import { isoWeek, utcDay, daysBetween } from "./dates";
import { compareVersionsDesc } from "./versions";
import { parseEnvelope, validateEvents } from "./validation";

const now = Date.UTC(2026, 8, 29, 12);
const base = { eventId: "e1", eventName: "app_opened", anonymousId: "anon_1", timestamp: now };

describe("validateEvents", () => {
  test("accepts a well-formed event and normalizes context", () => {
    const { events, rejections } = validateEvents(
      [{ ...base, properties: { plan: "pro", n: 1, ok: true, none: null }, context: { platform: "iOS", appVersion: 2, unknown: "x" } }],
      { receivedAt: now },
    );
    expect(rejections).toEqual([]);
    expect(events[0]).toMatchObject({ properties: { plan: "pro", n: 1, ok: true, none: null }, context: { platform: "ios", appVersion: "2" } });
    expect(events[0]!.context).not.toHaveProperty("unknown");
  });

  const manyLongValues = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, "y".repeat(1000)]));
  test.each([
    ["empty name", { ...base, eventName: "" }, "invalid_event_name"],
    ["unknown $ name", { ...base, eventName: "$custom" }, "reserved_event_name"],
    ["whitespace in id", { ...base, anonymousId: "has space" }, "invalid_id"],
    ["$ property key", { ...base, properties: { $bad: 1 } }, "invalid_properties"],
    ["nested property", { ...base, properties: { obj: {} } }, "invalid_properties"],
    ["oversized properties", { ...base, properties: manyLongValues }, "properties_too_large"],
    ["future timestamp", { ...base, timestamp: now + 60 * 60 * 1000 }, "timestamp_out_of_range"],
    ["non-numeric timestamp", { ...base, timestamp: "yesterday" }, "invalid_event"],
  ])("rejects %s", (_label, event, reason) => {
    const { rejections } = validateEvents([event], { receivedAt: now });
    expect(rejections[0]?.reason).toBe(reason);
  });

  test("truncates long strings except error stacks, which get more room", () => {
    const long = "a".repeat(5000);
    const { events } = validateEvents(
      [
        { ...base, properties: { note: long } },
        { ...base, eventId: "e2", eventName: "$error", properties: { stack: long } },
      ],
      { receivedAt: now },
    );
    expect(String(events[0]!.properties.note)).toHaveLength(1024);
    expect(String(events[1]!.properties.stack)).toHaveLength(5000);
  });

  test("flags duplicate event ids inside one batch", () => {
    const { events, rejections } = validateEvents([base, base], { receivedAt: now });
    expect(events).toHaveLength(1);
    expect(rejections).toEqual([{ index: 1, eventId: "e1", reason: "duplicate_in_batch" }]);
  });

  test("envelope limits", () => {
    expect(parseEnvelope({ events: [] }).ok).toBe(false);
    expect(parseEnvelope({ apiKey: "k", events: new Array(101).fill(base) })).toMatchObject({ ok: false, error: "too_many_events" });
  });
});

describe("helpers", () => {
  test("normalizePropertyKey", () => {
    expect(normalizePropertyKey("Plan Type")).toBe("Plan_Type");
    expect(normalizePropertyKey("1st-screen")).toBe("p_1st_screen");
    expect(normalizePropertyKey("$set")).toBe("p_set");
    expect(normalizePropertyKey("   ")).toBeNull();
  });

  test("date buckets", () => {
    expect(utcDay(now)).toBe("2026-09-29");
    expect(isoWeek(Date.UTC(2026, 0, 1))).toBe("2026-W01");
    expect(isoWeek(Date.UTC(2027, 0, 1))).toBe("2026-W53");
    expect(daysBetween("2026-02-27", "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  test("compareVersionsDesc", () => {
    expect(["2.9.1", "2.10.0", "10.0", "2.10.0-beta"].sort(compareVersionsDesc)).toEqual(["10.0", "2.10.0-beta", "2.10.0", "2.9.1"]);
  });
});
