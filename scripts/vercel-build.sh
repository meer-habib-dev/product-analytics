#!/usr/bin/env sh
# Vercel build: deploy Convex (functions + schema), then build the dashboard
# against that deployment. Run from the repo root.
set -e

if [ -z "$CONVEX_DEPLOY_KEY" ]; then
  echo "error: CONVEX_DEPLOY_KEY is not set for this Vercel environment (${VERCEL_ENV:-unknown})." >&2
  echo "  Convex dashboard -> your project -> Production -> Settings -> Generate Production Deploy Key," >&2
  echo "  then Vercel -> Settings -> Environment Variables -> CONVEX_DEPLOY_KEY (Production), and redeploy." >&2
  echo "  Preview builds need their own key (Convex: Generate Preview Deploy Key) on the Preview environment." >&2
  exit 1
fi

exec bunx convex deploy \
  --cmd 'bunx turbo run build --filter=@analytics/dashboard' \
  --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
