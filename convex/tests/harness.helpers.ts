import type { WireEvent } from "@analytics/shared";
import { convexTest } from "convex-test";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

export const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);

export async function setupProject() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "dev@example.com" }));
  const asUser = t.withIdentity({ subject: `${userId}|test-session` });
  const projectId: Id<"projects"> = await asUser.mutation(api.projects.mutations.create, { name: "Ringo" });
  const [key] = await asUser.query(api.projects.apiKeys.list, { projectId });
  return { t, asUser, userId, projectId, apiKey: key!.key };
}

let counter = 0;

export function makeEvent(overrides: Partial<WireEvent> = {}): WireEvent {
  counter++;
  return {
    eventId: `evt_${counter}_${Math.random().toString(36).slice(2)}`,
    eventName: "app_opened",
    anonymousId: "anon_1",
    sessionId: "sess_1",
    timestamp: NOW - 60_000 + counter,
    properties: {},
    context: { platform: "ios", appVersion: "1.0.0", sdkVersion: "0.1.0" },
    ...overrides,
  };
}

export async function postBatch(
  t: ReturnType<typeof convexTest>,
  apiKey: string,
  events: unknown[],
  extra: Record<string, unknown> = {},
) {
  const response = await t.fetch("/v1/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, sentAt: NOW, events, ...extra }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
