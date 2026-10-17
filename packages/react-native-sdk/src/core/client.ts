import {
  INGESTION_LIMITS,
  isValidIdentifier,
  RESERVED_EVENTS,
  SDK_DEFAULTS,
  type EventProperties,
} from "@analytics/shared";
import { Backoff } from "./backoff";
import { type AnalyticsConfig, type ResolvedConfig, resolveConfig } from "./config";
import { errorToProperties } from "./errors";
import { EventFactory } from "./eventFactory";
import { IdentityManager } from "./identity";
import { createLogger } from "./logger";
import { sanitizeProperties } from "./properties";
import { EventQueue } from "./queue";
import { SessionManager, type SessionTransition } from "./session";
import { type FetchLike, Transport } from "./transport";
import type { AppStateStatus, EventContext, Logger, PropertiesInput, StorageAdapter } from "./types";
import { Uploader } from "./uploader";

/** Everything that touches React Native / Expo is injected, which keeps the core testable in plain Node. */
export interface PlatformBindings {
  createDefaultStorage(logger: Logger): StorageAdapter;
  getContext(): EventContext;
  subscribeAppState?(listener: (state: AppStateStatus) => void): () => void;
  installGlobalErrorHandler?(handler: (error: unknown, isFatal: boolean) => void): () => void;
  fetch: FetchLike;
  now?: () => number;
}

const STORAGE_PREFIX = "analytics";
const MAX_PENDING_CALLS = 1000;

interface Runtime {
  config: ResolvedConfig;
  queue: EventQueue;
  identity: IdentityManager;
  sessions: SessionManager;
  factory: EventFactory;
  uploader: Uploader;
  storage: StorageAdapter;
  teardown: Array<() => void>;
}

/**
 * Public API surface. Every method is synchronous (except `flush`), never
 * throws and never waits for the network: events are persisted locally and
 * uploaded in the background.
 */
export class AnalyticsClient {
  private runtime: Runtime | undefined;
  private status: "idle" | "loading" | "ready" | "disabled" = "idle";
  private ready: Promise<void> = Promise.resolve();
  /** Calls made before storage finished loading, replayed in order with their original timestamps. */
  private pending: Array<() => void> = [];
  private optedOut = false;
  private debug = false;
  private readonly logger: Logger = createLogger(() => this.debug);
  private readonly now: () => number;

  constructor(private readonly platform: PlatformBindings) {
    this.now = platform.now ?? Date.now;
  }

  init(config: AnalyticsConfig): void {
    this.guard(() => {
      if (this.status !== "idle") {
        this.logger.warn("init() called more than once; ignoring.");
        return;
      }
      this.debug = config.debug ?? false;
      // Checked first so a build without keys can pass `enabled: false` quietly.
      if (config.enabled === false) {
        this.status = "disabled";
        this.pending = [];
        return;
      }
      if (!config.apiKey || !config.host) {
        console.warn("[analytics] init() requires apiKey and host; analytics is disabled.");
        this.status = "disabled";
        return;
      }
      const resolved = resolveConfig(config);
      if (!resolved.enabled) {
        this.status = "disabled";
        this.pending = [];
        return;
      }
      this.runtime = this.createRuntime(resolved);
      this.status = "loading";
      this.ready = this.load(this.runtime);
    });
  }

  /** Records a custom event. Names starting with `$` are reserved for the SDK. */
  track(eventName: string, properties?: PropertiesInput): void {
    if (eventName.startsWith("$")) {
      this.logger.warn(`"${eventName}" is reserved; use screen(), identify() or error() instead.`);
      return;
    }
    this.enqueueCall((rt, timestamp) => this.capture(rt, eventName, sanitizeProperties(properties, this.logger), timestamp));
  }

  screen(name: string, properties?: PropertiesInput): void {
    this.enqueueCall((rt, timestamp) => {
      rt.factory.setScreen(name);
      this.capture(rt, RESERVED_EVENTS.screen, sanitizeProperties({ ...properties, name }, this.logger), timestamp);
    });
  }

  /**
   * Associates this device with your user id. Traits are stored on the
   * person only because you passed them. Identifying as a different user
   * than the current one implies a reset, so two accounts never merge.
   */
  identify(distinctId: string, traits?: PropertiesInput): void {
    const id = String(distinctId ?? "").trim();
    if (!isValidIdentifier(id)) {
      this.logger.warn(`identify() ignored: "${distinctId}" is not a valid id.`);
      return;
    }
    this.enqueueCall((rt, timestamp) => {
      const previous = rt.identity.distinctId;
      if (previous !== undefined && previous !== id) this.resetIdentity(rt, timestamp);
      const changed = rt.identity.identify(id);
      if (changed || traits) this.capture(rt, RESERVED_EVENTS.identify, sanitizeProperties(traits, this.logger), timestamp);
    });
  }

  /** Records a handled error. Uncaught errors are captured automatically. */
  error(error: unknown, properties?: PropertiesInput): void {
    this.enqueueCall((rt, timestamp) => this.captureError(rt, error, false, properties, timestamp));
  }

  /** Call on logout: forgets the user, starts a new anonymous identity and a new session. */
  reset(): void {
    this.enqueueCall((rt, timestamp) => this.resetIdentity(rt, timestamp));
  }

  /** Uploads everything queued now. Resolves when done; never rejects. */
  async flush(): Promise<void> {
    try {
      await this.ready;
      await this.runtime?.uploader.flush();
    } catch (error) {
      this.logger.warn("flush() failed.", error);
    }
  }

  /** Stops collection and discards queued events until `optIn()`. Persisted across restarts. */
  optOut(): void {
    this.enqueueCall((rt) => {
      this.optedOut = true;
      rt.queue.clear();
      void Promise.resolve(rt.storage.setItem(`${STORAGE_PREFIX}.optedOut`, "1")).catch(() => undefined);
    });
  }

  optIn(): void {
    this.enqueueCall((rt) => {
      this.optedOut = false;
      void Promise.resolve(rt.storage.removeItem(`${STORAGE_PREFIX}.optedOut`)).catch(() => undefined);
    });
  }

  getAnonymousId(): string | undefined {
    return this.runtime?.identity.anonymousId || undefined;
  }

  getDistinctId(): string | undefined {
    return this.runtime?.identity.distinctId;
  }

  getSessionId(): string | undefined {
    return this.runtime?.sessions.sessionId;
  }

  /** Stops timers and listeners. Mostly useful in tests. */
  shutdown(): void {
    this.runtime?.uploader.stop();
    this.runtime?.teardown.forEach((fn) => fn());
    this.runtime?.queue.persistNow();
  }

  private createRuntime(config: ResolvedConfig): Runtime {
    const storage = config.storage ?? this.platform.createDefaultStorage(this.logger);
    const queue = new EventQueue(
      storage,
      `${STORAGE_PREFIX}.queue`,
      { maxQueueSize: config.maxQueueSize, maxQueueBytes: config.maxQueueBytes, maxEventBytes: INGESTION_LIMITS.maxPropertiesBytes * 2 },
      this.logger,
    );
    const identity = new IdentityManager(storage, STORAGE_PREFIX, this.logger);
    const sessions = new SessionManager(config.sessionTimeoutMs);
    const context = { ...safeContext(this.platform, this.logger), ...config.context };
    const factory = new EventFactory(identity, () => sessions.sessionId, context, this.logger);
    const transport = new Transport(
      { host: config.host, apiKey: config.apiKey, timeoutMs: config.requestTimeoutMs },
      this.platform.fetch,
      this.logger,
      this.now,
    );
    const uploader = new Uploader(
      queue,
      transport,
      new Backoff(SDK_DEFAULTS.minBackoffMs, SDK_DEFAULTS.maxBackoffMs),
      { flushAt: config.flushAt, flushIntervalMs: config.flushIntervalMs, maxBatchSize: config.maxBatchSize },
      this.logger,
      this.now,
    );
    return { config, queue, identity, sessions, factory, uploader, storage, teardown: [] };
  }

  private async load(rt: Runtime): Promise<void> {
    try {
      const [, , optedOut] = await Promise.all([
        rt.queue.load(),
        rt.identity.load(),
        Promise.resolve(rt.storage.getItem(`${STORAGE_PREFIX}.optedOut`)).catch(() => null),
      ]);
      this.optedOut = optedOut === "1";
    } catch (error) {
      this.logger.warn("Loading persisted state failed; continuing with fresh state.", error);
    }

    const restored = rt.queue.size;
    this.emitSessionTransition(rt, rt.sessions.start(this.now()));
    rt.uploader.start();
    this.attachPlatformListeners(rt);
    this.status = "ready";
    this.logger.debug(`Initialized. anonymousId=${rt.identity.anonymousId} queued=${rt.queue.size}`);

    const calls = this.pending;
    this.pending = [];
    calls.forEach((call) => call());
    // Events left over from a previous run (e.g. offline at shutdown) go out right away.
    if (restored > 0) rt.uploader.flushIfDue();
  }

  private attachPlatformListeners(rt: Runtime): void {
    const unsubscribe = this.platform.subscribeAppState?.((state) =>
      this.guard(() => {
        if (state === "background" || state === "inactive") {
          rt.queue.persistNow();
          void rt.uploader.flush();
        } else if (state === "active") {
          const transition = rt.sessions.touch(this.now());
          if (transition) this.emitSessionTransition(rt, transition);
        }
      }),
    );
    if (unsubscribe) rt.teardown.push(unsubscribe);

    if (rt.config.captureUncaughtErrors) {
      const uninstall = this.platform.installGlobalErrorHandler?.((error, isFatal) =>
        this.guard(() => {
          this.captureError(rt, error, isFatal, undefined, this.now());
          // The app may be about to die: write synchronously, then try to send.
          rt.queue.persistNow();
          void rt.uploader.flush();
        }),
      );
      if (uninstall) rt.teardown.push(uninstall);
    }
  }

  private enqueueCall(call: (rt: Runtime, timestamp: number) => void): void {
    this.guard(() => {
      if (this.status === "disabled") return;
      const timestamp = this.now();
      const run = () => this.guard(() => this.runtime && call(this.runtime, timestamp));
      if (this.status === "ready") {
        run();
        return;
      }
      if (this.pending.length >= MAX_PENDING_CALLS) this.pending.shift();
      this.pending.push(run);
    });
  }

  private capture(rt: Runtime, eventName: string, properties: EventProperties, timestamp: number): void {
    if (this.optedOut) return;
    const transition = rt.sessions.touch(timestamp);
    if (transition) this.emitSessionTransition(rt, transition);
    this.enqueue(rt, eventName, properties, timestamp);
  }

  private enqueue(rt: Runtime, eventName: string, properties: EventProperties, timestamp: number): void {
    const event = rt.factory.create(eventName, properties, timestamp);
    if (!event) return;
    if (rt.queue.enqueue(event)) {
      this.logger.debug(`Queued ${eventName}`, properties);
      rt.uploader.onEnqueued();
    }
  }

  private captureError(rt: Runtime, error: unknown, fatal: boolean, extra: PropertiesInput | undefined, timestamp: number): void {
    const { stack, ...base } = errorToProperties(error, fatal);
    const properties = sanitizeProperties({ ...base, screen: rt.factory.screen, ...extra }, this.logger);
    if (typeof stack === "string") properties.stack = stack.slice(0, INGESTION_LIMITS.maxStackLength);
    this.capture(rt, RESERVED_EVENTS.error, properties, timestamp);
  }

  private resetIdentity(rt: Runtime, timestamp: number): void {
    const ended = rt.sessions.sessionId;
    if (ended && rt.config.trackSessions && !this.optedOut) this.enqueue(rt, RESERVED_EVENTS.sessionEnd, { reason: "reset" }, timestamp);
    rt.identity.reset();
    this.emitSessionTransition(rt, { started: rt.sessions.start(timestamp).started });
  }

  private emitSessionTransition(rt: Runtime, transition: SessionTransition): void {
    if (!rt.config.trackSessions || this.optedOut) return;
    if (transition.ended) {
      // Emitted with the previous session's id and last-activity time, after the fact.
      const event = rt.factory.create(RESERVED_EVENTS.sessionEnd, { reason: "timeout" }, transition.ended.lastActivityAt);
      if (event && rt.queue.enqueue({ ...event, sessionId: transition.ended.sessionId })) rt.uploader.onEnqueued();
    }
    this.enqueue(rt, RESERVED_EVENTS.sessionStart, {}, transition.started.startedAt);
  }

  /** Analytics must never crash the host app. */
  private guard(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.logger.warn("Internal error (ignored).", error);
    }
  }
}

function safeContext(platform: PlatformBindings, logger: Logger): EventContext {
  try {
    return platform.getContext();
  } catch (error) {
    logger.warn("Could not read device context.", error);
    return {};
  }
}
