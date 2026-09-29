import { AppState } from "react-native";
import type { AppStateStatus } from "../core/types";

export function subscribeAppState(listener: (state: AppStateStatus) => void): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler(): GlobalHandler; setGlobalHandler(handler: GlobalHandler): void };

/**
 * Wraps React Native's global JS error handler. The previous handler always
 * runs afterwards, so red boxes and crash reporters keep working.
 */
export function installGlobalErrorHandler(onError: (error: unknown, isFatal: boolean) => void): () => void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return () => undefined;

  const previous = errorUtils.getGlobalHandler();
  const handler: GlobalHandler = (error, isFatal) => {
    try {
      onError(error, isFatal === true);
    } finally {
      previous(error, isFatal);
    }
  };
  errorUtils.setGlobalHandler(handler);
  return () => {
    if (errorUtils.getGlobalHandler() === handler) errorUtils.setGlobalHandler(previous);
  };
}
