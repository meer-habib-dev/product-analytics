# Deployment

## Convex backend

```bash
npx convex deploy                  # production deployment
npx @convex-dev/auth --prod        # sets JWT_PRIVATE_KEY, JWKS and SITE_URL on the prod deployment
```

- `SITE_URL` must be the dashboard's public URL (for example `https://analytics.example.com`).
- The ingestion endpoint is served by Convex HTTP actions at `https://<deployment>.convex.site/v1/batch`. To use your own domain, point a custom domain at the Convex site URL (Convex dashboard → Settings → Custom domains), or proxy `/v1/batch` from your own host.
- The hourly cron `delete expired unique markers` (`convex/crons.ts`) deploys automatically.

For self-hosted Convex, set `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` and use the same commands.

## Dashboard (Next.js)

Deploy `apps/dashboard` to any Node host (Vercel works out of the box; set the root directory to `apps/dashboard`).

| Env var | Value |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `https://<deployment>.convex.cloud` |
| `NEXT_PUBLIC_INGESTION_HOST` | Optional: the host shown in setup snippets (defaults to the `.convex.site` URL) |

On Vercel, the build command can deploy Convex and build the dashboard in one step:

```
cd ../.. && npx convex deploy --cmd 'pnpm --filter @analytics/dashboard build'
```

(with `CONVEX_DEPLOY_KEY` set in the Vercel project).

## Mobile apps

Each app gets its own project and key:

```
EXPO_PUBLIC_ANALYTICS_KEY=proj_…
EXPO_PUBLIC_ANALYTICS_HOST=https://<deployment>.convex.site
```

The key is public and write-only. If one leaks or is abused, create a new key in Settings, ship it, and disable the old one.

## Publishing the SDK

```bash
pnpm --filter @analytics/react-native build
cd packages/react-native-sdk && npm publish --access public   # or your private registry
```

The build inlines `@analytics/shared`, so the published package has no workspace dependencies.
