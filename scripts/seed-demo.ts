/**
 * Sends realistic demo traffic to a project through the public ingestion
 * endpoint, exactly like the SDK would. Useful for trying the dashboard
 * without a device, and as an end-to-end smoke test of ingestion.
 *
 *   bun run seed:demo --host https://<deployment>.convex.site --key proj_xxx [--users 60] [--days 14]
 */
import { BATCH_PATH, type BatchResponse, type WireEvent } from "@analytics/shared";
import { randomUUID } from "node:crypto";

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (value === undefined) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return value;
}

const host = arg("host").replace(/\/+$/, "");
const apiKey = arg("key");
const userCount = Number(arg("users", "60"));
const days = Math.min(Number(arg("days", "14")), 28);

const DAY = 86_400_000;
const releases = [
  { appVersion: "2.3.0", buildNumber: "80", from: days, to: days / 2 },
  // The newer release ships a checkout bug, so the dashboard has something to find.
  { appVersion: "2.4.0", buildNumber: "82", from: days / 2, to: 0 },
];
const screens = ["Home", "Inbox", "Chat", "Settings", "Paywall", "Checkout"];

let seed = 42;
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;

function simulateUser(index: number): WireEvent[] {
  const events: WireEvent[] = [];
  const platform = random() < 0.6 ? "ios" : "android";
  const anonymousId = `anon_demo_${index}`;
  const distinctId = random() < 0.7 ? `user_${1000 + index}` : undefined;
  let identified = false;
  const sessionsCount = 1 + Math.floor(random() * 6);

  for (let s = 0; s < sessionsCount; s++) {
    const daysAgo = random() * days;
    const release = releases.find((r) => daysAgo <= r.from && daysAgo >= r.to) ?? releases[1]!;
    const context = {
      platform,
      appVersion: release.appVersion,
      buildNumber: release.buildNumber,
      osVersion: platform === "ios" ? "18.2" : "15",
      deviceModel: platform === "ios" ? "iPhone 16" : "Pixel 9",
      locale: "en-US",
      timezone: "Asia/Dhaka",
      sdkVersion: "0.1.0",
    } as const;
    const sessionId = `sess_demo_${index}_${s}`;
    let t = Date.now() - daysAgo * DAY - random() * 3_600_000;
    const push = (eventName: string, properties: WireEvent["properties"] = {}, screen?: string) => {
      t += 2_000 + random() * 40_000;
      events.push({
        eventId: randomUUID(),
        eventName,
        anonymousId,
        distinctId: identified ? distinctId : undefined,
        sessionId,
        timestamp: Math.min(Math.round(t), Date.now()),
        properties,
        context: { ...context, screen },
      });
    };

    push("$session_start");
    push("app_opened");
    if (s === 0) push("onboarding_started", {}, "Onboarding");
    if (s === 0 && random() < 0.8) push("onboarding_completed", { steps: 4 }, "Onboarding");
    if (distinctId && !identified && random() < 0.8) {
      identified = true;
      push("$identify", { plan: random() < 0.3 ? "pro" : "free" });
    }
    for (let i = 0; i < 2 + Math.floor(random() * 6); i++) {
      const screen = pick(screens.slice(0, 4));
      push("$screen", { name: screen }, screen);
      if (screen === "Chat") push("message_sent", { length: Math.floor(random() * 200) }, screen);
      if (random() < 0.15) push("feature_used", { feature: pick(["search", "voice_note", "reactions"]) }, screen);
    }
    if (random() < 0.5) {
      push("paywall_viewed", { source: pick(["settings", "limit_reached", "onboarding"]) }, "Paywall");
      if (random() < 0.55) {
        const plan = random() < 0.6 ? "yearly" : "monthly";
        push("plan_selected", { plan, price: plan === "yearly" ? 49.99 : 5.99 }, "Paywall");
        push("checkout_started", { plan }, "Checkout");
        const buggy = release.appVersion === "2.4.0" && random() < 0.35;
        if (buggy) {
          push(
            "$error",
            {
              name: "TypeError",
              message: `Cannot read property 'price' of undefined (order ${Math.floor(random() * 9999)})`,
              stack: "TypeError: Cannot read property 'price' of undefined\n    at confirmPurchase (address at index.android.bundle:1:48211)\n    at onPress (address at index.android.bundle:1:9921)",
              fatal: false,
              screen: "Checkout",
            },
            "Checkout",
          );
        } else if (random() < 0.7) {
          push("subscription_started", { plan, price: plan === "yearly" ? 49.99 : 5.99, source: "paywall" }, "Checkout");
        }
      }
    }
    if (random() < 0.05) {
      push("$error", { name: "Error", message: "Network request failed", fatal: false, screen: "Inbox" }, "Inbox");
    }
  }
  return events;
}

async function send(events: WireEvent[]): Promise<BatchResponse> {
  const response = await fetch(`${host}${BATCH_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, sentAt: Date.now(), events }),
  });
  const body = (await response.json()) as BatchResponse & { error?: string; message?: string };
  if (!response.ok) throw new Error(`${response.status} ${body.error}: ${body.message}`);
  return body;
}

async function main() {
  const events = Array.from({ length: userCount }, (_, i) => simulateUser(i)).flat();
  console.log(`Sending ${events.length} events for ${userCount} users over ${days} days to ${host}…`);
  const totals = { accepted: 0, duplicates: 0, rejected: 0 };
  for (let i = 0; i < events.length; i += 100) {
    const result = await send(events.slice(i, i + 100));
    totals.accepted += result.accepted;
    totals.duplicates += result.duplicates;
    totals.rejected += result.rejected;
    if (result.errors?.length) console.warn("Rejected:", result.errors);
  }
  console.log("Done.", totals);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
