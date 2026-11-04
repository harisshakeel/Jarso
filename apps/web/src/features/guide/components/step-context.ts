import type { GuideContextRef } from "@jarso/core/guide";
import type { CurrentStep } from "@/features/learning";

/**
 * What to tell Jarso about the lesson step on screen, as content keys only: "Help me" before
 * the step is settled, "Why?" after. Null for the check-in, which Jarso stays out of.
 */
export function stepGuideContext(step: CurrentStep | null): GuideContextRef | null {
  if (!step || step.source === "check-in") return null;
  const ref = {
    source: step.source,
    missionKey: step.missionKey,
    stepKey: step.stepKey,
    phase: step.phase,
  } as const;
  return step.answered
    ? { entry: "why", ...ref, answer: step.answer }
    : {
        entry: "step",
        ...ref,
        wrongTries: step.wrongTries,
        hintsShown: step.hintsShown,
        lastTry: step.lastTry,
      };
}

/** One chat per step and per "Why?", so a new question never continues the old one's chat. */
export function stepChatKey(step: CurrentStep): string {
  return `${step.source}:${step.missionKey ?? "-"}:${step.stepKey}:${step.phase}:${step.answered}`;
}
