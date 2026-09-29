import { analytics } from "@analytics/react-native";
import { Stack, usePathname } from "expo-router";
import { useEffect } from "react";

// Initialize once, outside of render. Calls made before storage loads are buffered.
analytics.init({
  apiKey: process.env.EXPO_PUBLIC_ANALYTICS_KEY!,
  host: process.env.EXPO_PUBLIC_ANALYTICS_HOST!,
  debug: __DEV__,
});

export default function RootLayout() {
  const pathname = usePathname();

  // One $screen event per route change.
  useEffect(() => {
    analytics.screen(pathname);
  }, [pathname]);

  return <Stack />;
}
