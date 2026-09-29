import type { BatchRequest } from "@analytics/shared";
import { AnalyticsClient, type PlatformBindings } from "../src/core/client";
import type { AppStateStatus, StorageAdapter } from "../src/core/types";
import { createMemoryStorage } from "../src/storage/memory";

export interface FakeServer {
  requests: BatchRequest[];
  respond: (request: BatchRequest) => { status: number; body?: unknown; headers?: Record<string, string> } | Error;
}

export function createHarness(options: { storage?: StorageAdapter; server?: Partial<FakeServer> } = {}) {
  const storage = options.storage ?? createMemoryStorage();
  const server: FakeServer = {
    requests: [],
    respond: (req) => ({ status: 200, body: { accepted: req.events.length, duplicates: 0, rejected: 0 } }),
    ...options.server,
  };
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  let errorHandler: ((error: unknown, fatal: boolean) => void) | undefined;

  const bindings: PlatformBindings = {
    createDefaultStorage: () => storage,
    getContext: () => ({ platform: "ios", appVersion: "1.2.3", osVersion: "18.0", sdkVersion: "0.1.0" }),
    subscribeAppState: (listener) => {
      appStateListener = listener;
      return () => (appStateListener = undefined);
    },
    installGlobalErrorHandler: (handler) => {
      errorHandler = handler;
      return () => (errorHandler = undefined);
    },
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init.body)) as BatchRequest;
      server.requests.push(request);
      const result = server.respond(request);
      if (result instanceof Error) throw result;
      return {
        status: result.status,
        headers: new Headers(result.headers ?? {}),
        text: async () => (typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {})),
      };
    },
  };

  const client = new AnalyticsClient(bindings);
  return {
    client,
    storage,
    server,
    sentEvents: () => server.requests.flatMap((r) => r.events),
    setAppState: (state: AppStateStatus) => appStateListener?.(state),
    throwUncaught: (error: unknown, fatal = true) => errorHandler?.(error, fatal),
  };
}

export const config = { apiKey: "proj_test", host: "https://example.convex.site/", flushIntervalMs: 10_000 };

/** Lets queued microtasks (storage loads, coalesced persistence) run. */
export async function tick(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
