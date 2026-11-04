import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useSession } from "@/features/auth";
import { logger } from "@/lib";
import { askForPush, registerForPush } from "./register";

/**
 * `ask`: Jarso may still show Android's prompt; `blocked`: only the phone's settings can turn
 * them on; `hidden`: allowed, not a real phone, still loading, or the user said "Not now" here.
 */
export type PushPermissionState = "hidden" | "ask" | "blocked";

const dismissedKey = (userId: string) => `jarso-push-card-dismissed:${userId}`;

/**
 * Whether the home screen should offer to turn notifications on, and the actions for it.
 * Re-checks when the app comes back from the phone's settings.
 */
export function usePushPermission() {
  const { status: session, userId } = useSession();
  const role = session === "child" || session === "parent" ? session : undefined;
  const [state, setState] = useState<PushPermissionState>("hidden");
  const [busy, setBusy] = useState(false);
  /** Bumped by every load and by "Not now": only the latest one may apply its result. */
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const apply = (next: PushPermissionState) => {
      if (seq === loadSeqRef.current) setState(next);
    };
    if (!userId || !Device.isDevice) return apply("hidden");
    try {
      const [permission, dismissed] = await Promise.all([
        Notifications.getPermissionsAsync(),
        AsyncStorage.getItem(dismissedKey(userId)),
      ]);
      if (permission.granted || dismissed) apply("hidden");
      else apply(permission.canAskAgain === false ? "blocked" : "ask");
    } catch {
      apply("hidden");
    }
  }, [userId]);

  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    return () => sub.remove();
  }, [load]);

  /** Our line, then Android's prompt; registers the phone when allowed. */
  const turnOn = useCallback(async () => {
    if (!userId || !role) return;
    setBusy(true);
    try {
      await registerForPush({ userId, role, ask: askForPush, force: true });
      await load();
    } finally {
      setBusy(false);
    }
  }, [userId, role, load]);

  const openSettings = useCallback(
    () => Linking.openSettings().catch(() => logger.warn("Could not open the phone's settings")),
    [],
  );

  /** "Not now": the card stays away on this phone; the settings page still offers "Turn on". */
  const dismiss = useCallback(async () => {
    loadSeqRef.current++;
    setState("hidden");
    if (userId) await AsyncStorage.setItem(dismissedKey(userId), "1").catch(() => undefined);
  }, [userId]);

  return { state, busy, role, turnOn, openSettings, dismiss };
}
