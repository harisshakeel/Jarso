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
 * moved on). Saves are optimistic and roll back on error. Re-checks when the app comes back to
 * the foreground (after the phone's settings).
 */
export function useDevicePushPrefs() {
  const { status: session, userId } = useSession();
  const role = session === "child" || session === "parent" ? session : undefined;
  const [status, setStatus] = useState<DevicePushPrefsStatus>("loading");
  const [prefs, setPrefs] = useState<DevicePushPrefs | null>(null);
  const tokenRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && permission.status !== "undetermined") {
        setStatus("denied");
        return;
      }
      const token = permission.granted ? await getRegisteredToken(userId) : null;
      const stored = token ? await fetchDevicePushPrefs(supabase, token) : null;
      tokenRef.current = stored ? token : null;
      setPrefs(stored);
      setStatus(stored ? "ready" : "no-token");
    } catch {
      setStatus("no-token");
    }
  }, [userId]);

  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    return () => sub.remove();
  }, [load]);

  const save = useCallback(
    async (next: DevicePushPrefs) => {
      const token = tokenRef.current;
      if (!token) return;
      const previous = prefs;
      setPrefs(next);
      try {
        const saved = await saveDevicePushPrefs(supabase, { token, ...next });
        if (!saved) throw new AppError("NOT_FOUND", GENERIC_FAILURE);
      } catch (error) {
        setPrefs(previous);
        throw error;
      }
    },
    [prefs],
  );

  /** "Turn on": asks (again, if needed) and registers this phone, then reloads. */
  const turnOn = useCallback(async () => {
    if (!userId || !role) return;
    await registerForPush({ userId, role, ask: askForPush, force: true });
    await load();
  }, [userId, role, load]);

  return { prefs, status, save, turnOn };
}
