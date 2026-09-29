import { describe, expect, test } from "vitest";
import { computeErrorSignature, firstApplicationFrame, normalizeMessage } from "../errors/fingerprint";
import { computeFunnel } from "../funnels/compute";

describe("error fingerprint", () => {
  test("ignores volatile values in messages", () => {
    expect(normalizeMessage("User 42 not found (id 7f3c9a2e-1b2c-4d5e-8f90-123456789abc)")).toBe(
      normalizeMessage("User 1337 not found (id 00000000-1111-4222-8333-444444444444)"),
    );
  });

  test("uses the first application frame, without line numbers", () => {
    const hermes = [
      "Error: boom",
      "    at anonymous (address at index.android.bundle:1:9999)",
      "    at dispatch (node_modules/react-native/Libraries/foo.js:1:2)",
      "    at submitOrder (address at index.android.bundle:1:1234)",
    ].join("\n");
    expect(firstApplicationFrame(hermes)).toBe("submitOrder (index.android.bundle)");
    expect(firstApplicationFrame("submitOrder@app:///main.jsbundle:10:20")).toBe("submitOrder (main.jsbundle)");
  });

  test("same bug across releases groups together", () => {
    const a = computeErrorSignature({ name: "TypeError", message: "Order 1 failed", stack: "at pay (index.bundle:1:100)" });
    const b = computeErrorSignature({ name: "TypeError", message: "Order 2 failed", stack: "at pay (index.bundle:1:5000)" });
    const c = computeErrorSignature({ name: "RangeError", message: "Order 2 failed", stack: "at pay (index.bundle:1:5000)" });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });
});

describe("computeFunnel", () => {
  const hour = 3600_000;
  const occ = (personId: string, timestamp: number, breakdown?: string) => ({ personId, timestamp, breakdown });

  test("ordered steps within the conversion window", () => {
    const result = computeFunnel({
      start: 0,
      end: 100 * hour,
      conversionWindowMs: 24 * hour,
      steps: [
        [occ("a", 1 * hour), occ("b", 1 * hour), occ("c", 1 * hour)],
        [occ("a", 2 * hour), occ("b", 0), occ("c", 30 * hour)],
        [occ("a", 3 * hour)],
      ],
    });
    // b did step 2 before step 1; c converted outside the window.
    expect(result.steps.map((s) => s.count)).toEqual([3, 1, 1]);
    expect(result.steps[1]).toMatchObject({ conversionFromPrevious: 1 / 3, dropOffFromPrevious: 2, medianTimeFromPreviousMs: hour });
  });

  test("picks the attempt that gets furthest", () => {
    const result = computeFunnel({
      start: 0,
      end: 100 * hour,
      conversionWindowMs: 2 * hour,
      steps: [[occ("a", 0), occ("a", 50 * hour)], [occ("a", 51 * hour)]],
    });
    expect(result.steps.map((s) => s.count)).toEqual([1, 1]);
  });

  test("only entries inside the range count and breakdown uses the entry event", () => {
    const result = computeFunnel({
      start: 10,
      end: 20,
      conversionWindowMs: 100,
      steps: [[occ("a", 5, "1.0"), occ("b", 15, "1.1")], [occ("a", 16), occ("b", 16)]],
    });
    expect(result.steps.map((s) => s.count)).toEqual([1, 1]);
    expect(result.breakdown).toEqual([{ value: "1.1", counts: [1, 1] }]);
  });
});
