import type { GoalProgress } from "./progress";

// The goal as a coin staircase (FR02, design.md §6): one step per allowance of the plan, the
// goal's item on the top step, the child's coach on the step they have reached. Pure: the
// drawing and the page read it, the tests pin it.

/** The most steps drawn; beyond that, allowances are grouped per step. */
export const MAX_STEPS = 12;
/** Without a plan per allowance the climb is split into this many equal steps. */
const STEPS_WITHOUT_PLAN = 8;

export type Staircase = {
  /** Steps drawn, 1 to MAX_STEPS. */
  steps: number;
  /** Allowances each step stands for (1 unless the plan needs more than MAX_STEPS steps). */
  perStep: number;
  /** Steps climbed so far (solid gold). */
  filled: number;
  /** The step the coach stands on: 0 is the ground before the first step, `steps` is the top. */
  coachAt: number;
  reached: boolean;
};

/** Where the climb stands against the goal's price and plan. */
export function staircaseFor(
  progress: Pick<GoalProgress, "fillRatio" | "reached">,
  targetMinor: number,
  planMinor: number | null,
): Staircase {
  const allowances =
    planMinor !== null && planMinor > 0 ? Math.max(1, Math.ceil(targetMinor / planMinor)) : null;
  const steps = allowances === null ? STEPS_WITHOUT_PLAN : Math.min(MAX_STEPS, allowances);
  const perStep = allowances === null ? 1 : Math.ceil(allowances / steps);
  const filled = progress.reached ? steps : Math.min(steps, Math.floor(progress.fillRatio * steps));
  return { steps, perStep, filled, coachAt: filled, reached: progress.reached };
}

/** The quarter marks, as shares of the goal. */
export const MILESTONES = [0.25, 0.5, 0.75, 1] as const;
export type Milestone = (typeof MILESTONES)[number];

/** The highest quarter mark passed between two fill ratios, or null when none was. */
export function milestoneCrossed(previous: number, next: number): Milestone | null {
  let crossed: Milestone | null = null;
  for (const mark of MILESTONES) if (previous < mark && next >= mark) crossed = mark;
  return crossed;
}

/** The one line under the picture. */
export function goalLine(
  progress: Pick<GoalProgress, "reached" | "paymentsLeft" | "remainingMinor">,
  money: (minor: number) => string,
): string {
  if (progress.reached) return "Reached. Time to ask your parent.";
  if (progress.paymentsLeft === null) return `${money(progress.remainingMinor)} to go`;
  return progress.paymentsLeft === 1
    ? "About 1 allowance to go"
    : `About ${progress.paymentsLeft} allowances to go`;
}

/** A note when a step stands for more than one allowance. */
export function stepsCaption(stair: Staircase): string | null {
  if (stair.perStep <= 1) return null;
  return `Each step is ${stair.perStep} allowances.`;
}

/** The picture in words, for assistive tech. */
export function staircaseLabel(
  goal: { name: string; targetMinor: number },
  stair: Staircase,
  money: (minor: number) => string,
): string {
  const climbed = stair.reached
    ? "every step climbed"
    : `${stair.filled} of ${stair.steps} steps climbed`;
  return `Your goal: ${goal.name}, ${money(goal.targetMinor)}. ${climbed}.`;
}
