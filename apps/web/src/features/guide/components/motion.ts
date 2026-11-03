"use client";

import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: no-preference)";

/** True when the device allows motion. False where `matchMedia` is missing (the server, jsdom). */
export function motionAllowed(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** `motionAllowed()` as a hook, false on the server so the HTML matches. */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribe, motionAllowed, () => false);
}
