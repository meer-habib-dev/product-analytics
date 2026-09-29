import { AnalyticsClient } from "./core/client";
import { reactNativeBindings } from "./platform/bindings";

/** The app-wide analytics instance. Call `analytics.init()` once at startup. */
export const analytics = new AnalyticsClient(reactNativeBindings);

export { AnalyticsClient } from "./core/client";
export type { PlatformBindings } from "./core/client";
export type { AnalyticsConfig } from "./core/config";
export type { EventContext, EventProperties, PropertiesInput, StorageAdapter } from "./core/types";
export { createMemoryStorage } from "./storage/memory";
export { createAsyncStorageAdapter, createMMKVStorage, type MMKVLike } from "./storage/mmkv";
export { trackNavigationScreens, type NavigationRefLike } from "./navigation";
export { SDK_VERSION } from "./version";
