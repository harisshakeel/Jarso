"use client";

import { useSyncExternalStore } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();
const successListeners = new Set<Listener>();
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

/**
 * Whether a rejection is the browser failing to reach the server: a fetch `TypeError` ("Failed to
 * fetch" in Chrome, "NetworkError…" in Firefox, "Load failed" in Safari, "fetch failed" in Node).
 * Any other throw, a `TypeError` from a bug included, is not a sign of being offline.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes("Failed to fetch")) return true;
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}

/** Lets other modules mark the connection as lost after a request fails to reach the server. */
export function reportNetworkFailure(): void {
  set(false);
}

/** Marks the connection as working after a request got through. */
export function reportNetworkSuccess(): void {
  set(true);
  for (const listener of successListeners) listener();
}

/** Runs `listener` after every request that got through, changed state or not. */
export function onNetworkSuccess(listener: Listener): () => void {
  successListeners.add(listener);
  return () => {
    successListeners.delete(listener);
  };
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
