# Connecting the Clarity app

How to send analytics from the Clarity Expo app to the production platform.

## 1. Create the project

In the production dashboard: **+ New project** → `Clarity` → copy the `proj_…` key from the setup page.

## 2. Install the SDK

```bash
# inside the Clarity repo
mkdir -p vendor && cp <path>/analytics-react-native-0.1.0.tgz vendor/
npx expo install ./vendor/analytics-react-native-0.1.0.tgz react-native-mmkv react-native-nitro-modules expo-application expo-device
```

MMKV is a native module: rebuild the dev client (`npx expo run:ios` / `eas build --profile development`) after installing.

## 3. Configure keys per environment

```bash
eas env:create --environment production  --name EXPO_PUBLIC_ANALYTICS_KEY  --value proj_xxx --visibility plaintext
eas env:create --environment production  --name EXPO_PUBLIC_ANALYTICS_HOST --value https://<deployment>.convex.site --visibility plaintext
```

Use a second project (e.g. `Clarity (dev)`) and key for the `development`/`preview` environments so test traffic never pollutes production numbers.

## 4. Initialize and track screens

`src/lib/analytics.ts`: one place that owns the SDK and the app's event catalog:

```ts
import { analytics } from "@analytics/react-native";

analytics.init({
  apiKey: process.env.EXPO_PUBLIC_ANALYTICS_KEY!,
  host: process.env.EXPO_PUBLIC_ANALYTICS_HOST!,
  debug: __DEV__,
  enabled: Boolean(process.env.EXPO_PUBLIC_ANALYTICS_KEY),
});

/** Typed catalog: every event Clarity sends, in object_action form. */
type ClarityEvents = {
  onboarding_started: undefined;
  onboarding_completed: { steps: number };
  paywall_viewed: { source: string };
  plan_selected: { plan: "monthly" | "yearly"; price: number };
  subscription_started: { plan: "monthly" | "yearly"; price: number; source: string };
  feature_used: { feature: string };
};

export function track<K extends keyof ClarityEvents>(
  name: K,
  ...props: ClarityEvents[K] extends undefined ? [] : [ClarityEvents[K]]
) {
  analytics.track(name, props[0]);
}

export { analytics };
```

Root layout (`app/_layout.tsx`):

```tsx
import "@/lib/analytics"; // initializes once, before any screen renders
import { analytics } from "@/lib/analytics";
import { usePathname } from "expo-router";

const pathname = usePathname();
useEffect(() => analytics.screen(pathname), [pathname]);
```

## 5. Identity

Call these wherever Clarity's auth state changes:

```ts
analytics.identify(user.id, { plan: user.plan });   // after sign-in / session restore
analytics.reset();                                  // on sign-out
```

Only pass traits you want visible in the dashboard. Never pass tokens or message contents.

## 6. Errors

Uncaught JS errors are captured automatically. For handled failures that matter (purchases, sync, API calls):

```ts
try {
  await purchase(plan);
} catch (error) {
  analytics.error(error, { screen: "Paywall", plan });
  throw error;
}
```

## 7. Verify before release

1. Run a development build with `debug: true`. The Metro console shows `[analytics] Queued …` and `Uploaded N events`.
2. Dashboard → Clarity → **Events** shows the events live.
3. Background the app: queued events flush immediately.
4. Create the core funnel (e.g. `paywall_viewed → plan_selected → subscription_started`) and save it.
5. Ship the production build with the production key.
