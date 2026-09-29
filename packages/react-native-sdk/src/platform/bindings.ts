import type { PlatformBindings } from "../core/client";
import { createMemoryStorage } from "../storage/memory";
import { createMMKVStorage } from "../storage/mmkv";
import { getExpoContext } from "./context";
import { installGlobalErrorHandler, subscribeAppState } from "./lifecycle";

export const reactNativeBindings: PlatformBindings = {
  createDefaultStorage(logger) {
    try {
      return createMMKVStorage();
    } catch (error) {
      // Expo Go ships without MMKV's native module.
      logger.warn("MMKV unavailable (Expo Go?); queued events won't survive restarts. Use a development build.", error);
      return createMemoryStorage();
    }
  },
  getContext: getExpoContext,
  subscribeAppState,
  installGlobalErrorHandler,
  fetch: (input, init) => fetch(input, init),
};
