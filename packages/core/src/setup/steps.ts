/**
 * The parent's onboarding on the phone, as the spec counts it: welcome, how Jarso works, the
 * account (with the email code and "about you"), a child, pocket money, freedom, the share card.
 */
export const PARENT_STEPS = [
  "welcome",
  "how",
  "account",
  "child",
  "money",
  "freedom",
  "share",
] as const;
export type ParentStep = (typeof PARENT_STEPS)[number];

/** 1-based position for the step dots. */
export function parentStepNumber(step: ParentStep): number {
  return PARENT_STEPS.indexOf(step) + 1;
}
