import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
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
 * so a row the phone doesn't know about stops buzzing too. Sign-out cancels a registration still
 * running: it posts nothing more, and a POST already out is unregistered when it lands.
 */
export function usePushRegistration(): void {
  const { status, userId } = useSession();
  const role = status === "child" || status === "parent" ? status : undefined;
  const tokenRef = useRef<string | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!role || !userId) return;
    let active = true;
    // Aborted when sign-out begins: a registration still running can't post or store after it.
    const signingOut = new AbortController();
    tokenRef.current = null;
    let registering = false;
    let registered = false;
    // The newest token the listener reported, the one the running sign-up fetched, and whether
    // the listener reported a new token while that sign-up ran.
    let deviceToken: string | null = null;
    let fetched: string | null = null;
    let missed = false;
    const register = () => {
      if (signingOut.signal.aborted || registering) return;
      registering = true;
      fetched = null;
      missed = false;
      pendingRef.current = registerForPush({
        userId,
        role,
        ask: askForPush,
        signal: signingOut.signal,
        onDeviceToken: (token) => {
          fetched = token;
        },
      })
        .then((token) => {
          registered = token !== null;
          if (active && token) tokenRef.current = token;
        })
        .finally(() => {
          registering = false;
          // The token rotated while this ran: the one it posted is already old.
          if (active && missed && fetched && deviceToken !== fetched) register();
        });
    };
    register();

    // Android fires this on every token fetch too, ours included: only a new token is a rotation,
    // else each registration would set off the next one, forever. Our own fetch's event lands
    // while its registration is still running, so `register` skips it; a real rotation then is
    // posted once that sign-up ends.
    const tokens = Notifications.addPushTokenListener(({ data }) => {
      if (data === deviceToken) return;
      deviceToken = data;
      if (registering) missed = true;
      register();
    });
    // A sign-up that came to nothing (offline, a failed POST, notifications off) tries again when
    // the app comes back: cheap, it asks the user nothing more and posts only once allowed.
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active" && !registered) register();
    });
    const dispose = registerBeforeSignOut(async function dropPushToken() {
      signingOut.abort();
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
      foreground.remove();
      dispose();
    };
  }, [role, userId]);
}
