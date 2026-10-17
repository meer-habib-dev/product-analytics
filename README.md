# Product Analytics

A small, self-hosted product analytics and error tracking platform for React Native / Expo apps.

Install one SDK in any Expo app and see what users do, which screens and features they use, where funnels drop off, which releases have problems, and which JavaScript errors hit which users. It borrows useful ideas from PostHog and Sentry without trying to clone either.

```
React Native / Expo app
  └─ @analytics/react-native      track() → persistent MMKV queue → batched POST, retries with backoff
        │
        ▼  POST /v1/batch  (public project key)
Convex HTTP action                 size check → key → schema validation → normalization
  └─ internal mutation             dedupe → identity → insert → lightweight aggregates (one transaction)
        │
        ▼
Convex tables                      events (source of truth) + people, sessions, error groups, daily aggregates
  └─ queries / actions             aggregates for charts, bounded index scans for explorers, on-demand funnels
        │
        ▼
Next.js dashboard                  reactive Convex queries, Tailwind + shadcn/ui + Recharts
```

## Repository layout

```
apps/dashboard/              Next.js 16 dashboard (App Router, Convex Auth, Tailwind v4, shadcn/ui, Recharts)
packages/react-native-sdk/   @analytics/react-native: the SDK
packages/shared/             Wire protocol types, limits, naming rules, validation (zod), date buckets
convex/                      Backend: schema, HTTP ingestion, analytics queries, tests
  events/                    HTTP endpoint, ingestion mutation, explorer queries
  people/                    identity resolution, merges, people queries
  sessions/                  session tracking and queries
  errors/                    fingerprinting, grouping, error queries/mutations
  funnels/                   funnel CRUD, pure funnel math, on-demand calculation action
  analytics/                 aggregates, overview, trends, releases, saved insights, maintenance cron
  projects/                  projects and ingestion keys
  lib/                       authorization, validators, date ranges
examples/expo-app/           Copy-paste integration example (not part of the workspace)
scripts/seed-demo.ts         Sends realistic demo traffic through the real ingestion endpoint
docs/                        Architecture, data model, event conventions, deployment
```

## Quick start

Requirements: Node 22+, Bun 1.3+, a Convex account (or a self-hosted Convex backend).

```bash
bun install

# 1. Create a Convex deployment and generate types.
#    Writes CONVEX_URL / CONVEX_SITE_URL to .env.local; the dashboard reads them automatically.
bunx convex dev

# 2. One-time, in a second terminal: configure Convex Auth keys on the deployment.
#    When asked for the local web server URL, enter http://localhost:3000
bunx @convex-dev/auth

# 3. Start the dashboard
bun run dev:dashboard
```

Then open http://localhost:3000.

In the dashboard, create an account, create a project (for example "Ringo"), and copy its `proj_…` key from the setup page.

Integrate an app (about five minutes):

```bash
npx expo install @analytics/react-native react-native-mmkv react-native-nitro-modules expo-application expo-device
```

```ts
import { analytics } from "@analytics/react-native";

analytics.init({ apiKey: process.env.EXPO_PUBLIC_ANALYTICS_KEY!, host: "https://<deployment>.convex.site" });

analytics.track("plan_selected", { plan: "yearly", price: 49.99 });
analytics.screen("Checkout");
analytics.identify("user_123", { plan: "pro" });
analytics.error(error, { screen: "Checkout" });
analytics.reset();          // on logout
await analytics.flush();    // optional
```

No device handy? Send demo traffic through the real endpoint:

```bash
bun run seed:demo --host https://<deployment>.convex.site --key proj_xxx --users 60 --days 14
```

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev:convex` | Run `convex dev` (pushes functions, regenerates `convex/_generated`) |
| `bun run dev:dashboard` | Dashboard dev server |
| `bun run typecheck` | Typecheck every package and the Convex functions |
| `bun run test` | All tests: Convex functions (convex-test), SDK, shared |
| `bun run build` | Build the SDK (tsup) and the dashboard |
| `bun run seed:demo` | Send demo traffic to a project |

## Documentation

- [Architecture](docs/architecture.md): ingestion pipeline, idempotency, real-time strategy and the scaling path
- [Data model](docs/data-model.md): every table and index and why it exists, plus aggregation correctness
- [Event conventions](docs/event-conventions.md): naming, reserved `$` events, properties and limits
- [SDK reference](packages/react-native-sdk/README.md): API, configuration, queue, retries and privacy
- [Production deployment](docs/deployment.md): Convex + Vercel runbook, access lock, checklist
- [Connecting the Clarity app](docs/clarity-integration.md)

## Tech choices

Bun (package manager and script runner) + Turborepo + TypeScript everywhere. Tests run on Vitest and the dashboard on Next.js, under Node. Convex is the whole backend: database, HTTP ingestion, queries, mutations, actions, crons, auth and real-time. There is no additional database, queue or cache. That's deliberate for V1; [docs/architecture.md](docs/architecture.md#scaling-path) describes what to change, and when, if volume ever demands it.
