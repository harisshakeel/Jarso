"use client";

import type { Phase, StepAnswer } from "@jarso/core/learning";
import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * The step the player is showing, for helpers rendered beside it (the guide's "Help me" and
 * "Why?"). Keys only: whoever needs the step's text looks it up from trusted content by key.
 */
export type CurrentStep = {
  /** "mission" steps are keyed by mission and step; practice and topic steps by item key. */
  source: "mission" | "practice" | "topic" | "check-in";
  missionKey: string | null;
  stepKey: string;
  phase: Phase;
  /** Wrong tries so far on this step (0 to 2). */
  wrongTries: number;
  /** How many of the step's hints the child has opened (0 to 2). */
  hintsShown: number;
  /** The child's last wrong try while they can still have another go; null otherwise. */
  lastTry: StepAnswer | null;
  /** The final outcome is showing: the child has answered and can ask "Why?". */
  answered: boolean;
  /** The child's final answer once answered (for "Why?"); null before that. */
  answer: StepAnswer | null;
};

export const CurrentStepContext = createContext<CurrentStep | null>(null);

export function useCurrentStep(): CurrentStep | null {
  return useContext(CurrentStepContext);
}

// The same step for helpers outside the player's tree: Jarso's floating buddy lives in the
// child layout, so it can't read the context above. The player publishes the step it shows
// and clears it when the step goes; one player is on a page at a time.
let shown: CurrentStep | null = null;
const listeners = new Set<() => void>();

/** Called by the player: the step on screen now, or null once it has gone. */
export function publishShownStep(step: CurrentStep | null): void {
  shown = step;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The lesson step on screen anywhere on this page, or null when there is none. */
export function useShownStep(): CurrentStep | null {
  return useSyncExternalStore(
    subscribe,
    () => shown,
    () => null,
  );
}
