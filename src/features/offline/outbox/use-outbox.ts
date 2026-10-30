"use client";

import { useCallback, useSyncExternalStore } from "react";
import { open } from "./store";
import type { OutboxItem } from "./types";

const EMPTY: OutboxItem[] = [];
/** Last read per user. Keyed by user so one child never sees another's items. */
const snapshots = new Map<string, OutboxItem[]>();

function subscribeTo(userId: string, onChange: () => void) {
  let active = true;
  let unsubscribe = () => {};

  const refresh = async (store: NonNullable<Awaited<ReturnType<typeof open>>>) => {
    const items = await store.listForUser(userId).catch(() => undefined);
    if (!active || !items) return;
    snapshots.set(userId, items.length ? items : EMPTY);
    onChange();
  };

  void open().then((store) => {
    if (!store || !active) return;
    unsubscribe = store.subscribe(() => void refresh(store));
    void refresh(store);
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

/** This user's outbox items, oldest first, kept live across tabs. Empty on the server. */
export function useOutbox(userId: string): OutboxItem[] {
  const subscribe = useCallback((onChange: () => void) => subscribeTo(userId, onChange), [userId]);
  const getSnapshot = useCallback(() => snapshots.get(userId) ?? EMPTY, [userId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
