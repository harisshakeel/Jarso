import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { registerBeforeSignOut, useSession } from "@/features/auth";
import { askForPush, registerForPush, unregisterFromPush } from "./register";

/**
 * Once a child or parent is signed in: registers this phone for their pushes (once per user),
 * posts a rotated token again, and drops the token before sign-out.
 */
export function usePushRegistration(): void {
  const { status, userId } = useSession();
  const role = status === "child" || status === "parent" ? status : undefined;
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!role || !userId) return;
    let active = true;
    tokenRef.current = null;
    const register = () =>
      registerForPush({ userId, role, ask: askForPush }).then((token) => {
        if (active && token) tokenRef.current = token;
      });
    void register();

    const tokens = Notifications.addPushTokenListener(() => void register());
    const dispose = registerBeforeSignOut(async function dropPushToken() {
      const token = tokenRef.current;
      if (token) await unregisterFromPush(token, userId);
    });
    return () => {
      active = false;
      tokens.remove();
      dispose();
    };
  }, [role, userId]);
}
