// biome-ignore lint/correctness/useReactNativePlatformComponents: the app ships on Android only
import { AccessibilityInfo, ToastAndroid } from "react-native";

/**
 * A short confirmation after a write (the web's toasts): an Android toast, also read out by the
 * screen reader, which does not always voice toasts.
 */
export function flash(message: string): void {
  ToastAndroid.show(message, ToastAndroid.SHORT);
  AccessibilityInfo.announceForAccessibility(message);
}
