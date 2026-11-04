import { type NoticeRole, pushPromptCopy } from "@jarso/core/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Alert } from "react-native";
import { isAppError, logger } from "@/lib";
import { apiFetch } from "@/lib/api";
import { ensureNoticeChannel } from "./channel";

const TOKENS_PATH = "/api/v1/push/tokens";
const askedKey = (userId: string) => `jarso-push-asked:${userId}`;
const tokenKey = (userId: string) => `jarso-push-token:${userId}`;

/** The token this phone registered for `userId`, if any (the settings page needs it). */
export async function getRegisteredToken(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(tokenKey(userId)).catch(() => null);
}

/** The one-line reason before Android's prompt. Resolves true on "Turn on". */
export function askForPush(role: NoticeRole): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      pushPromptCopy.title,
      pushPromptCopy[role],
      [
        { text: pushPromptCopy.later, style: "cancel", onPress: () => resolve(false) },
        { text: pushPromptCopy.allow, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export type RegisterArgs = {
  userId: string;
  role: NoticeRole;
  ask: (role: NoticeRole) => Promise<boolean>;
  /** Asks again even when this user was asked before ("Turn on" on the settings page). */
  force?: boolean;
};

/** Notification permission, asking each user once: our line first, then Android's prompt. */
async function permitted({ userId, role, ask, force }: RegisterArgs): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.status !== "undetermined") return false;
  if (!force && (await AsyncStorage.getItem(askedKey(userId)))) return false;
  await AsyncStorage.setItem(askedKey(userId), "1");
  if (!(await ask(role))) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Registers this phone for the signed-in user's pushes; returns the token or null. Real devices
 * only. Never throws, and never logs the token.
 */
export async function registerForPush(args: RegisterArgs): Promise<string | null> {
  if (!Device.isDevice) return null;
  try {
    // Before any permission request: Android 13 prompts only once a channel exists.
    await ensureNoticeChannel();
    if (!(await permitted(args))) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiFetch(TOKENS_PATH, {
      method: "POST",
      auth: true,
      body: { token, platform: "android" },
    });
    await AsyncStorage.setItem(tokenKey(args.userId), token);
    return token;
  } catch (error) {
    logger.warn("Push registration failed", { code: isAppError(error) ? error.code : undefined });
    return null;
  }
}

/** How long sign-out waits for the server to forget the token (its hooks get 5 s in all). */
export const UNREGISTER_BUDGET_MS = 3_000;

/** Drops the phone's FCM registration: later sends fail as DeviceNotRegistered. Never throws. */
export async function dropPhoneRegistration(): Promise<void> {
  await Notifications.unregisterForNotificationsAsync().catch(() => {
    logger.warn("Could not drop the phone's push registration");
  });
}

/**
 * Forgets this phone's token before sign-out. If the server can't be told within the budget
 * (offline, a hanging network), the phone drops its FCM registration instead, so later sends
 * fail as DeviceNotRegistered and the row is cleaned up. Never throws.
 */
export async function unregisterFromPush(token: string, userId?: string): Promise<void> {
  if (userId) await AsyncStorage.removeItem(tokenKey(userId)).catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deleted = apiFetch(TOKENS_PATH, { method: "DELETE", auth: true, body: { token } }).then(
    () => true,
    () => false,
  );
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), UNREGISTER_BUDGET_MS);
  });
  const ok = await Promise.race([deleted, late]);
  clearTimeout(timer);
  if (ok) return;
  logger.warn("Push unregister failed; dropping the phone's registration");
  await dropPhoneRegistration();
}
