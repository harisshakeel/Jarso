"use client";

import { useCurrentStep } from "@/features/learning";
import type { GuideContextRef } from "../schemas";
import { GuideSheet } from "./guide-sheet";

/**
 * "Help me" beside a step, or "Why?" once it is answered (spec §5.1). Rendered by the mission
 * player as its step aside; it reads the step from the player's context, by key only.
 */
export function StepGuide({ introNeeded }: { introNeeded: boolean }) {
  const step = useCurrentStep();
  if (!step || step.source === "check-in") return null;
  const ref = {
    source: step.source,
    missionKey: step.missionKey,
    stepKey: step.stepKey,
    phase: step.phase,
  } as const;
  const context: GuideContextRef = step.answered
    ? { entry: "why", ...ref, answer: step.answer }
    : { entry: "step", ...ref, wrongTries: step.wrongTries };
  return (
    <GuideSheet
      // A new chat for each step and for its "Why?".
      key={`${step.stepKey}:${step.phase}:${step.answered}`}
      context={context}
      introNeeded={introNeeded}
      triggerLabel={step.answered ? "Why?" : "Help me"}
      compact
    />
  );
}
