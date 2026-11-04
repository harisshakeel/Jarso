import type { DevicePushPrefs } from "@jarso/core/notifications";
import { fetchDevicePushPrefs, saveDevicePushPrefs } from "@jarso/data/notifications";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useSession } from "@/features/auth";
import { AppError, GENERIC_FAILURE } from "@/lib";
import { supabase } from "@/lib/supabase/client";
import { askForPush, getRegisteredToken, registerForPush } from "./register";

export type DevicePushPrefsStatus = "loading" | "ready" | "no-token" | "denied";

/**
 * This phone's push settings for the signed-in user. `denied`: Android notifications are off
 * for Jarso; `no-token`: this phone isn't registered for this account (never allowed, or the row
 * moved on). Saves are optimistic and run one at a time: a change made while one is saving is
 * sent after it (only the latest, as a full record), and a failure rolls back to what the server
 * last confirmed. Re-checks when the app comes back to the foreground (after the phone's settings).
 */
export function useDevicePushPrefs() {
  const { status: session, userId } = useSession();
  const role = session === "child" || session === "parent" ? session : undefined;
  const [status, setStatus] = useState<DevicePushPrefsStatus>("loading");
  const [prefs, setPrefs] = useState<DevicePushPrefs | null>(null);
  const tokenRef = useRef<string | null>(null);
  /** Bumped by every load: only the latest one may apply its result. */
  const loadSeqRef = useRef(0);
  /** What the server last confirmed, and the record the user wants it to hold. */
  const confirmedRef = useRef<DevicePushPrefs | null>(null);
  const desiredRef = useRef<DevicePushPrefs | null>(null);
  const flushRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const seq = ++loadSeqRef.current;
    const latest = () => seq === loadSeqRef.current;
    try {
      const permission = await Notifications.getPermissionsAsync();
      // Only when Android won't ask again does it take the phone's settings; else "Turn on".
      if (!permission.granted && permission.canAskAgain === false) {
        if (latest()) setStatus("denied");
        return;
      }
      const token = permission.granted ? await getRegisteredToken(userId) : null;
      const stored = token ? await fetchDevicePushPrefs(supabase, token) : null;
      if (!latest()) return;
      tokenRef.current = stored ? token : null;
      confirmedRef.current = stored;
      // A save in flight owns what shows; it sends the user's latest change after this.
      if (!flushRef.current) {
        desiredRef.current = stored;
        setPrefs(stored);
      }
      setStatus(stored ? "ready" : "no-token");
    } catch {
      if (latest()) setStatus("no-token");
    }
  }, [userId]);

  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    return () => sub.remove();
  }, [load]);

  /** Sends the latest wanted record until the server holds it. One runs at a time. */
  const flush = useCallback(async (token: string) => {
    while (desiredRef.current && desiredRef.current !== confirmedRef.current) {
      const sending = desiredRef.current;
      try {
        const saved = await saveDevicePushPrefs(supabase, { token, ...sending });
        if (!saved) throw new AppError("NOT_FOUND", GENERIC_FAILURE);
        confirmedRef.current = sending;
      } catch (error) {
        // A newer change made meanwhile is a full record: send it instead.
        if (desiredRef.current !== sending) continue;
        desiredRef.current = confirmedRef.current;
        setPrefs(confirmedRef.current);
        throw error;
      }
    }
  }, []);

  const save = useCallback(
    (next: DevicePushPrefs): Promise<void> => {
      const token = tokenRef.current;
      if (!token) return Promise.resolve();
      desiredRef.current = next;
      setPrefs(next);
      if (!flushRef.current) {
        flushRef.current = flush(token).finally(() => {
          flushRef.current = null;
        });
      }
      return flushRef.current;
    },
    [flush],
  );

  /** "Turn on": asks (again, if needed) and registers this phone, then reloads. */
  const turnOn = useCallback(async () => {
    if (!userId || !role) return;
    await registerForPush({ userId, role, ask: askForPush, force: true });
    await load();
  }, [userId, role, load]);

  return { prefs, status, save, turnOn };
}
