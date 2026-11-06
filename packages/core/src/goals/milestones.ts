import type { Frequency } from "@jarso/core/allowance";
import type { GoalProgress } from "./progress";
import { type Milestone, milestoneCrossed } from "./staircase";

// The phone's goal page: four stars (one per quarter) and "about N weeks". Pure; the quarter
// marks and the crossing rule are the staircase's, reused here.

/** Stars lit, 0..4: one per quarter mark reached; 4 only once the goal is reached. */
export function starsLit(progress: Pick<GoalProgress, "fillRatio" | "reached">): 0 | 1 | 2 | 3 | 4 {
  if (progress.reached) return 4;
  const marks = [0.25, 0.5, 0.75].filter((mark) => progress.fillRatio >= mark).length;
  return marks as 0 | 1 | 2 | 3;
}

/**
 * The star to cheer now, or null. Null on first sight (`seen` null), when nothing new lit,
 * when stars went down (target raised, money left), and for the 4th star (goal reached has its
 * own celebration). Several new stars at once cheer the highest of the first three.
 */
export function starToCheer(seen: number | null, lit: number): Milestone | null {
  if (seen === null) return null;
  return milestoneCrossed(seen / 4, Math.min(lit, 3) / 4);
}

const PERIODS_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

/**
 * About how many weeks to the goal at the plan. Null without a positive plan, a frequency, or
 * when nothing is left.
 */
export function weeksToGoal(input: {
  remainingMinor: number;
  planMinor: number | null;
  frequency: Frequency | null;
}): number | null {
  const { remainingMinor, planMinor, frequency } = input;
  if (planMinor === null || planMinor <= 0 || frequency === null || remainingMinor <= 0) {
    return null;
  }
  return Math.ceil((remainingMinor * 52) / (planMinor * PERIODS_PER_YEAR[frequency]));
}

/** "₹110 to go · about 4 weeks", "₹110 to go · about 1 week", "₹110 to go"; null when reached. */
export function toGoLine(
  progress: Pick<GoalProgress, "remainingMinor" | "reached">,
  weeks: number | null,
  money: (minor: number) => string,
): string | null {
  if (progress.reached) return null;
  const toGo = `${money(progress.remainingMinor)} to go`;
  if (weeks === null) return toGo;
  return `${toGo} · about ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}
