// The child's intro on the phone (mobile kid rework, plan 8). Sign-in comes before it; the last
// step is followed by the welcome celebration.

export const ONBOARDING_STEPS = ["meet", "spend", "save", "goal", "look"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The step after `step`, or null after the last (then the intro finishes). */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1] ?? null;
}

/** 1-based position for the dots. */
export function stepNumber(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step) + 1;
}

/** Steps that play with practice money and show the PRACTICE tag. */
export function isPracticeStep(step: OnboardingStep): boolean {
  return step === "spend" || step === "save";
}
