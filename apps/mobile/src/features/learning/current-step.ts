import type { Phase, StepAnswer } from "@jarso/core/learning";
import { createContext, useContext } from "react";

/**
 * The step the player is showing, for helpers rendered beside it (the guide's "Help me"). Keys
 * only: whoever needs the step's text looks it up from content by key. The web's twin.
 */
export type CurrentStep = {
  source: "mission" | "practice" | "topic" | "check-in";
  missionKey: string | null;
  stepKey: string;
  phase: Phase;
  /** Wrong tries so far on this step (0 to 2). */
  wrongTries: number;
  /** The final outcome is showing. */
  answered: boolean;
  /** The child's final answer once answered; null before that. */
  answer: StepAnswer | null;
};

export const CurrentStepContext = createContext<CurrentStep | null>(null);

export function useCurrentStep(): CurrentStep | null {
  return useContext(CurrentStepContext);
}
