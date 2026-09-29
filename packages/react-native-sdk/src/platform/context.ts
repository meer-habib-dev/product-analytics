import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";
import type { EventContext } from "../core/types";
import { SDK_VERSION } from "../version";

/**
 * Automatic, privacy-conscious context. Deliberately excluded: advertising
 * ids, device identifiers, location, contacts, clipboard, device name.
 */
export function getExpoContext(): EventContext {
  const intl = readIntl();
  return {
    platform: Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web" ? Platform.OS : "other",
    osVersion: String(Platform.Version),
    appVersion: Application.nativeApplicationVersion ?? undefined,
    buildNumber: Application.nativeBuildVersion ?? undefined,
    deviceModel: Device.modelName ?? undefined,
    locale: intl.locale,
    timezone: intl.timeZone,
    sdkVersion: SDK_VERSION,
  };
}

function readIntl(): { locale?: string; timeZone?: string } {
  try {
    const options = Intl.DateTimeFormat().resolvedOptions();
    return { locale: options.locale, timeZone: options.timeZone };
  } catch {
    return {};
  }
}
