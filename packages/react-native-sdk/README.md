# @analytics/react-native

A small analytics and error-tracking SDK for React Native and Expo. `track()` never waits for the network: events are persisted locally and uploaded in batches in the background.

## Install

```bash
npx expo install @analytics/react-native react-native-mmkv react-native-nitro-modules expo-application expo-device
```

MMKV needs a development build (`npx expo run:ios` / `run:android`). In Expo Go the SDK falls back to in-memory storage and logs a debug warning.

## Use

```ts
import { analytics } from "@analytics/react-native";

analytics.init({
  apiKey: process.env.EXPO_PUBLIC_ANALYTICS_KEY!,
  host: process.env.EXPO_PUBLIC_ANALYTICS_HOST!, // https://<deployment>.convex.site
  debug: __DEV__,
});

analytics.track("paywall_viewed");
analytics.track("plan_selected", { plan: "yearly", price: 49.99 });
analytics.screen("Checkout");
analytics.identify("user_123", { plan: "pro" });   // after login
analytics.error(error, { screen: "Checkout" });   // handled errors
analytics.reset();                                // on logout
await analytics.flush();                          // optional: upload now
```

Screen tracking with expo-router:

```tsx
const pathname = usePathname();
useEffect(() => analytics.screen(pathname), [pathname]);
```

With React Navigation:

```tsx
import { analytics, trackNavigationScreens } from "@analytics/react-native";
const ref = useNavigationContainerRef();
<NavigationContainer ref={ref} onReady={() => trackNavigationScreens(analytics, ref)}>
```

## API

| Method | Notes |
| --- | --- |
| `init(config)` | Call once at startup. Calls made before init or before storage loads are buffered and replayed with their original timestamps. |
| `track(name, properties?)` | Custom event. `$`-prefixed names are reserved. |
| `screen(name, properties?)` | Sends `$screen` and sets the current screen, which is attached to later events and errors. |
| `identify(distinctId, traits?)` | Links the device to your user id. Traits are stored on the person. Identifying as a *different* user implies `reset()`. |
| `error(error, properties?)` | Sends `$error` with name, message, stack and screen. |
| `reset()` | Logout: forgets the user, new anonymous id, new session. |
| `flush()` | Uploads queued events. Resolves when done and never rejects. |
| `optOut()` / `optIn()` | Stops or resumes collection and clears the queue. Persisted. |
| `getAnonymousId()`, `getDistinctId()`, `getSessionId()` | For debugging and support tooling. |

No method throws, and nothing blocks the UI. Failures are silent in production and logged when `debug: true`.

## Configuration

| Option | Default | |
| --- | --- | --- |
| `apiKey`, `host` | required | Public project key and ingestion base URL |
| `debug` | `false` | Console logging |
| `enabled` | `true` | `false` makes the SDK a no-op |
| `flushAt` | `20` | Queue size that triggers an upload |
| `flushIntervalMs` | `10000` | Periodic upload interval |
| `maxBatchSize` | `50` | Events per request (max 100) |
| `maxQueueSize` | `1000` | Queue cap, in events |
| `maxQueueBytes` | `1 MB` | Queue cap, in serialized size |
| `sessionTimeoutMs` | `30 min` | Inactivity before a new session |
| `requestTimeoutMs` | `10000` | Per-request timeout |
| `trackSessions` | `true` | Emit `$session_start` / `$session_end` |
| `captureUncaughtErrors` | `true` | Capture uncaught JS errors as fatal `$error` |
| `storage` | MMKV | Any `StorageAdapter`: `createMMKVStorage(instance?)`, `createAsyncStorageAdapter(AsyncStorage)`, `createMemoryStorage()` |
| `context` | automatic | Static overrides, e.g. `{ appVersion }` in bare apps |

## How delivery works

- **Persistent queue.** Events are written to MMKV (coalesced per tick; synchronously when the app is backgrounded or crashing). The queue survives restarts, airplane mode and timeouts.
- **Flush triggers.** 20 queued events, every 10 s, app goes to background, or `flush()`.
- **Batching.** Up to 50 events per `POST /v1/batch`.
- **Retries.** Network errors, timeouts, 408/429/5xx and malformed responses keep the events and back off exponentially with jitter (1 s → 5 min, honoring `Retry-After`). 413 halves the batch size. 401/403 (invalid or disabled key) stop uploads until the next launch, but keep the events. Other 4xx responses drop the batch, because it can never succeed.
- **Limits.** When the queue exceeds `maxQueueSize` or `maxQueueBytes`, the **oldest** events are discarded first. Events in flight are never evicted. Single events larger than 32 KB are dropped.
- **Idempotency.** Each event gets a UUID `eventId` before it's queued. The server deduplicates, so retries never double count.

## Automatic context and privacy

Collected automatically: platform, OS version, app version, build number, device model name, locale, timezone, SDK version and current screen.

Never collected: advertising IDs, device identifiers, location, contacts, clipboard, passwords, tokens, message or form contents. Person traits only exist if you pass them to `identify()`.

## Sessions

A new session starts on every cold launch, and on activity or return to the foreground after `sessionTimeoutMs` of inactivity. Session length is computed on the server from event timestamps, so apps killed without a clean shutdown still get correct sessions.

## Architecture

```
AnalyticsClient (public API, never throws)
 ├─ EventFactory      eventId, timestamp, identity, session, context
 ├─ IdentityManager   anonymous id + distinct id (persisted)
 ├─ SessionManager    in-memory sessions with inactivity timeout
 ├─ EventQueue        persistent FIFO with limits and in-flight tracking
 ├─ Uploader          batching, single-flight flush, backoff
 │   └─ Transport     fetch + response classification
 └─ PlatformBindings  storage (MMKV), context (Expo), AppState, ErrorUtils
```

The core is platform-free and unit tested in Node (`bun run test`).
