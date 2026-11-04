import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { registerBeforeSignOut, useSession } from "@/features/auth";
import {
  askForPush,
  dropPhoneRegistration,
  getRegisteredToken,
  registerForPush,
  unregisterFromPush,
} from "./register";

/** How long sign-out waits for a registration still in flight (a prompt may be open). */
const PENDING_WAIT_MS = 1_000;

function settledWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Once a child or parent is signed in: registers this phone for their pushes (once per user),
 * posts a rotated token again, and drops the token before sign-out. Sign-out uses the token this
 * mount registered, else the one stored for the user (an earlier run, or the settings page's
 * "Turn on"); with none known but notifications allowed it drops the phone's FCM registration,
 * so a row the phone doesn't know about stops buzzing too.
 */
export function usePushRegistration(): void {
  const { status, userId } = useSession();
  const role = status === "child" || status === "parent" ? status : undefined;
  const tokenRef = useRef<string | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!role || !userId) return;
    let active = true;
    tokenRef.current = null;
    const register = () => {
      const pending = registerForPush({ userId, role, ask: askForPush }).then((token) => {
        if (active && token) tokenRef.current = token;
      });
      pendingRef.current = pending;
      return pending;
    };
    void register();

    const tokens = Notifications.addPushTokenListener(() => void register());
    const dispose = registerBeforeSignOut(async function dropPushToken() {
      if (pendingRef.current) await settledWithin(pendingRef.current, PENDING_WAIT_MS);
      const token = tokenRef.current ?? (await getRegisteredToken(userId));
      if (token) {
        await unregisterFromPush(token, userId);
        return;
      }
      const permission = await Notifications.getPermissionsAsync().catch(() => null);
      if (permission?.granted) await dropPhoneRegistration();
    });
    return () => {
      active = false;
      tokens.remove();
      dispose();
    };
  }, [role, userId]);
}
