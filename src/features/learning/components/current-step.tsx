"use client";

import { createContext, useContext } from "react";
import type { Phase, StepAnswer } from "../types";

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
  /** The final outcome is showing: the child has answered and can ask "Why?". */
  answered: boolean;
  /** The child's final answer once answered (for "Why?"); null before that. */
  answer: StepAnswer | null;
};

export const CurrentStepContext = createContext<CurrentStep | null>(null);

export function useCurrentStep(): CurrentStep | null {
  return useContext(CurrentStepContext);
}
