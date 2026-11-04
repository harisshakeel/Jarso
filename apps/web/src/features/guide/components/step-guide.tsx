"use client";

import { guideCopy, guideUi } from "@jarso/core/guide";
import { useCurrentStep } from "@/features/learning";
import { GuideSheet } from "./guide-sheet";
import { stepChatKey, stepGuideContext } from "./step-context";

/**
 * "Help me" beside a step, or "Why?" once it is answered (spec §5.1). Rendered by the mission
 * player as its step aside; it reads the step from the player's context, by key only.
 */
export function StepGuide({ introNeeded }: { introNeeded: boolean }) {
  const step = useCurrentStep();
  const context = stepGuideContext(step);
  if (!step || !context) return null;
  return (
    <GuideSheet
      // A new chat for each step and for its "Why?".
      key={stepChatKey(step)}
      context={context}
      introNeeded={introNeeded}
      triggerLabel={step.answered ? guideUi.why : guideUi.helpMe}
      // Tapping it is the question: Jarso starts answering, no typing first.
      opener={step.answered ? guideCopy.lesson.whyOpener : guideCopy.lesson.helpOpener}
      compact
    />
  );
}
