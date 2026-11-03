import type { NextStep } from "./types";

/** The eyebrow over the next step on the child's Home. */
export const NEXT_STEP_EYEBROW = "Next step";

/** The next step (FR12) in plain words, with its one button. Each app maps the step to a screen. */
export function describeStep(step: NextStep): { title: string; body: string; cta: string } {
  switch (step.kind) {
    case "resume":
      return {
        title: "Halfway there. Keep going.",
        body: `Pick up "${step.title}" where you left off.`,
        cta: "Continue",
      };
    case "check-in":
      return {
        title: "Five quick questions. Then your first mission.",
        body: "They help pick where you start. Nothing is locked.",
        cta: "Start",
      };
    case "comeback":
      return {
        title: "Welcome back. One quick question?",
        body: "A fresh example of something you learned. About a minute.",
        cta: "Let's go",
      };
    case "practice":
      return {
        title: "Practice time. About a minute.",
        body:
          step.count === 1
            ? "One skill is ready for a quick review."
            : `${step.count} skills are ready for a quick review.`,
        cta: "Practise",
      };
    case "mission":
      return {
        title: `Day ${step.day}. ${step.title}`,
        body: "Two or three minutes. Hints are free.",
        cta: "Start mission",
      };
    case "done":
      return {
        title: "Journey done. Nicely learned.",
        body: "Practice comes back when a skill is due, so it stays fresh.",
        cta: "See your skills",
      };
  }
}
