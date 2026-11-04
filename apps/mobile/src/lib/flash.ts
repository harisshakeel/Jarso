// biome-ignore lint/correctness/useReactNativePlatformComponents: the app ships on Android only
import { AccessibilityInfo, ToastAndroid } from "react-native";

/**
 * A short confirmation after a write (the web's toasts): an Android toast, also read out by the
 * screen reader, which does not always voice toasts. `long` keeps it up about 3.5 s instead of
 * 2 s, for an answer the reader needs time with.
 */
export function flash(message: string, { long = false }: { long?: boolean } = {}): void {
  ToastAndroid.show(message, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
  AccessibilityInfo.announceForAccessibility(message);
}
