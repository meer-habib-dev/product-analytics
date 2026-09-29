import type { AnalyticsClient } from "./core/client";

/** The subset of a React Navigation container ref this helper needs. */
export interface NavigationRefLike {
  getCurrentRoute(): { name: string } | undefined;
  addListener(event: "state", callback: () => void): () => void;
}

/**
 * Sends `$screen` whenever the focused React Navigation route changes.
 * For expo-router, call `analytics.screen(pathname)` from `usePathname()` instead.
 */
export function trackNavigationScreens(client: AnalyticsClient, navigationRef: NavigationRefLike): () => void {
  let last: string | undefined;
  const report = () => {
    const name = navigationRef.getCurrentRoute()?.name;
    if (name && name !== last) {
      last = name;
      client.screen(name);
    }
  };
  report();
  return navigationRef.addListener("state", report);
}
