"use client";

import { useEffect, useSyncExternalStore } from "react";
import { primeSounds, setSoundsOn, soundsOn, subscribeSounds } from "@/lib/sounds";

/**
 * The sounds switch as React state, and the page primed to play after the first touch. The
 * server renders "on" (the choice lives in the browser) and the client corrects it on mount.
 */
export function useSounds(): { on: boolean; setOn: (on: boolean) => void } {
  const on = useSyncExternalStore(subscribeSounds, soundsOn, () => true);
  useEffect(() => {
    primeSounds();
  }, []);
  return { on, setOn: setSoundsOn };
}
