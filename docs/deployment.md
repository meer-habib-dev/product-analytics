# Production deployment

Production is one Convex deployment (database, ingestion endpoint, auth) plus the Next.js dashboard on Vercel. Vercel's build deploys Convex first, then builds the dashboard against it, so a single `git push` to `main` ships both.

## 1. Convex

1. Create the project once from your machine: `bun install`, then `bunx convex dev` (log in, pick "create a new project"). This also writes `convex/_generated`.
2. Convex dashboard → your project → **Production** → Settings → **Generate production deploy key**. Copy it.
3. Configure auth on the production deployment (from your machine):
   ```bash
   bunx @convex-dev/auth --prod
   ```
   This sets `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL`. Set `SITE_URL` to the dashboard URL you will use (e.g. `https://analytics.example.com`).
4. Lock the dashboard to your team (Convex dashboard → Production → Settings → Environment variables):

   | Variable | Example |
   | --- | --- |
   | `AUTH_ALLOWED_EMAILS` | `meer@koehler-international.com` |
   | `AUTH_ALLOWED_DOMAINS` | `koehler-international.com` |

   With neither variable set, anyone who finds the URL can create an account. Always set at least one in production.

## 2. Dashboard on Vercel

1. Vercel → **Add New Project** → import `meer-habib-dev/product-analytics`.
2. **Root Directory:** `apps/dashboard`. `apps/dashboard/vercel.json` already sets the install and build commands:
   ```
   install: cd ../.. && bun install --frozen-lockfile
   build:   cd ../.. && sh scripts/vercel-build.sh   (convex deploy, then the dashboard build)
   ```
3. Environment variables (Production):

   | Variable | Value |
   | --- | --- |
   | `CONVEX_DEPLOY_KEY` | the production deploy key from step 1.2 |
   | `NEXT_PUBLIC_INGESTION_HOST` | optional, e.g. `https://ingest.example.com` if you add a custom domain (defaults to the deployment's `.convex.site` URL) |

   `NEXT_PUBLIC_CONVEX_URL` is injected by `convex deploy` at build time; don't set it manually.
4. Deploy. Add your domain under Vercel → Domains and make sure it matches `SITE_URL`.

Every push to `main` now deploys Convex functions + schema and the dashboard together. Pull requests get preview builds (add a Convex *preview* deploy key as `CONVEX_DEPLOY_KEY` for the Preview environment if you want isolated preview backends).

## 3. Verify

```bash
# Sign in at the dashboard, create a project, copy its proj_ key, then:
bun run seed:demo --host https://<deployment>.convex.site --key proj_xxx --users 20 --days 3
```

The overview should fill in within seconds. Delete the demo project afterwards, or seed a throwaway project.

## 4. Mobile apps

Each app gets its own project and key, configured as EAS environment variables (or `.env`):

```
EXPO_PUBLIC_ANALYTICS_KEY=proj_…
EXPO_PUBLIC_ANALYTICS_HOST=https://<deployment>.convex.site
```

The key is public and write-only. If it leaks or is abused, create a new key in Settings, ship it, then disable the old one. App-specific steps for Clarity: [clarity-integration.md](clarity-integration.md).

## Distributing the SDK

Until the SDK is published to a registry, install it from a tarball:

```bash
bun run build:sdk
cd packages/react-native-sdk && bun pm pack      # → analytics-react-native-0.1.0.tgz
```

Commit the tarball into the app repo (e.g. `vendor/`) and install it with `npx expo install ./vendor/analytics-react-native-0.1.0.tgz`. To publish instead, rename the package to a scope you own on npm (e.g. `@meer-habib-dev/analytics-react-native`) and `npm publish --access public`. The build inlines `@analytics/shared`, so the package has no workspace dependencies.

## Custom ingestion domain (optional)

Convex dashboard → Production → Settings → Custom domains → add e.g. `ingest.example.com` for the **HTTP actions** (`.convex.site`) URL. Then use it as `EXPO_PUBLIC_ANALYTICS_HOST` and `NEXT_PUBLIC_INGESTION_HOST`. This lets you move the backend later without shipping new app builds.

## Production checklist

- [ ] `AUTH_ALLOWED_EMAILS` or `AUTH_ALLOWED_DOMAINS` set on the production deployment
- [ ] `SITE_URL` matches the dashboard domain
- [ ] `CONVEX_DEPLOY_KEY` (production) set in Vercel; first deploy succeeded
- [ ] Demo traffic shows up on the dashboard
- [ ] One project per app, using the production key in EAS production builds
- [ ] `debug: __DEV__` in `analytics.init` (no console logging in release builds)
- [ ] App built as a development or production build (MMKV doesn't run in Expo Go)
