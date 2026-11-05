"use client";

import type { CoachId } from "@jarso/core/learning";
import { useSyncExternalStore } from "react";

// The buddy the child picked on the welcome tour (2026-11-06) coaches every lesson step from
// then on. The tour, which lives in the child layout, says who it is here; lessons read it.
// Before a buddy is picked (or while the layout is still loading) each step keeps its own coach.

let current: CoachId | null = null;
const listeners = new Set<() => void>();

export function setLessonBuddy(buddy: CoachId | null): void {
  if (buddy === current) return;
  current = buddy;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The child's buddy, or null before they pick one. */
export function useLessonBuddy(): CoachId | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
