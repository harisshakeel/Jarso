"use client";

import { useSyncExternalStore } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();
let online = typeof navigator === "undefined" ? true : navigator.onLine;

function set(next: boolean) {
  if (online === next) return;
  online = next;
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => set(true));
  window.addEventListener("offline", () => set(false));
}

/** Current connection state, readable outside React. */
export function isOnline(): boolean {
  return online;
}

/** Lets other modules mark the connection as lost after a request fails to reach the server. */
export function reportNetworkFailure(): void {
  set(false);
}

/** Marks the connection as working after a request got through. */
export function reportNetworkSuccess(): void {
  set(true);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while the device looks connected. Server render assumes online. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
