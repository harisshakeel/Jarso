import type { OutboxItem } from "@jarso/core/offline";
import { useQueryClient } from "@tanstack/react-query";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { dispatchNotices } from "../notices";
import { keys } from "../query";
import { supabase } from "../supabase/client";
import {
  flush,
  isOnline,
  onPurchaseSent,
  outboxPlatform,
  setOnline,
  subscribeOnline,
} from "./platform";

const POLL_MS = 30_000;
const EMPTY: OutboxItem[] = [];
/** Last read per user, so one child never sees another's items. */
const snapshots = new Map<string, OutboxItem[]>();

function subscribeTo(userId: string, onChange: () => void) {
  let active = true;
  let unsubscribe = () => {};
  void outboxPlatform.openStore().then((store) => {
    if (!store || !active) return;
    const refresh = async () => {
      const items = await store.listForUser(userId).catch(() => undefined);
      if (!active || !items) return;
      snapshots.set(userId, items.length ? items : EMPTY);
      onChange();
    };
    unsubscribe = store.subscribe(() => void refresh());
    void refresh();
  });
  return () => {
    active = false;
    unsubscribe();
  };
}

/** This user's outbox items, oldest first, kept live. */
export function useOutboxItems(userId: string | undefined): OutboxItem[] {
  const subscribe = useCallback(
    (onChange: () => void) => (userId ? subscribeTo(userId, onChange) : () => {}),
    [userId],
  );
  const getSnapshot = useCallback(
    () => (userId ? (snapshots.get(userId) ?? EMPTY) : EMPTY),
    [userId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** True while the phone looks connected (unknown counts as connected). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline, isOnline);
}

const connected = (state: { isConnected?: boolean; isInternetReachable?: boolean | null }) =>
  state.isConnected !== false && state.isInternetReachable !== false;

/**
 * Sends the signed-in child's waiting items whenever they may get through: on mount, when the app
 * comes to the foreground, when the network comes back, after a token refresh, every 30 s while
 * the app is in front and something waits, and at the next item's backoff time. A purchase that
 * got through refreshes Home and History and tells the parent. Renders nothing.
 */
export function OutboxSync({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const items = useOutboxItems(userId);
  const waiting = items.some((item) => item.status === "waiting");
  const [foreground, setForeground] = useState(AppState.currentState !== "background");

  useEffect(() => {
    const run = () => void flush(userId);
    run();
    const appState = AppState.addEventListener("change", (next) => {
      setForeground(next === "active");
      if (next === "active") run();
    });
    getNetworkStateAsync()
      .then((state) => setOnline(connected(state)))
      .catch(() => undefined);
    const network = addNetworkStateListener((state) => {
      const wasOnline = isOnline();
      setOnline(connected(state));
      if (!wasOnline && isOnline()) run();
    });
    // A 401 leaves the item waiting; a fresh token is the moment to try it again.
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") setTimeout(run, 0);
    });
    const sent = onPurchaseSent(() => {
      void queryClient.invalidateQueries({ queryKey: keys.home(userId) });
      void queryClient.invalidateQueries({ queryKey: keys.history(userId) });
      dispatchNotices();
    });
    return () => {
      appState.remove();
      network.remove();
      auth.subscription.unsubscribe();
      sent();
    };
  }, [userId, queryClient]);

  useEffect(() => {
    if (!waiting || !foreground) return;
    const timer = setInterval(() => void flush(userId), POLL_MS);
    return () => clearInterval(timer);
  }, [userId, waiting, foreground]);

  // One timer for the earliest backoff, so the short 2 s / 5 s steps aren't left to the poll.
  useEffect(() => {
    if (!foreground) return;
    const now = Date.now();
    const due = items
      .filter((item) => item.status === "waiting")
      .map((item) => Date.parse(item.nextAttemptAt))
      .filter((at) => at > now);
    if (due.length === 0) return;
    const timer = setTimeout(() => void flush(userId), Math.min(...due) - now);
    return () => clearTimeout(timer);
  }, [userId, items, foreground]);

  return null;
}
