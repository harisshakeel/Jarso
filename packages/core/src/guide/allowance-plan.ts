import { minorDigits } from "@jarso/core/lib";

/**
 * The allowance-day plan (demo 3): on the day an allowance lands, Jarso proposes how much of
 * the Spend part to tuck into Save. Pure arithmetic over the handover and the goal; no model
 * is involved, and nothing here moves money. The app records the move as an ordinary deposit,
 * so the parent's ask/notify setting applies exactly as for a put-in the child typed.
 */

export type AllowancePlanInput = {
  /** The handover: what went to Spend as cash and what went straight into Save. */
  cashMinor: number;
  savedMinor: number;
  /** What Spend has free right now. The plan never proposes more than this. */
  availableSpendMinor: number;
  currency: string;
  /** The active goal, or null. `planMinor` is the child's own estimate per allowance. */
  goal: { name: string; planMinor: number | null; remainingMinor: number } | null;
};

export type AllowancePlan = {
  /** The extra to put into Save now, on top of what the parent already put there. */
  saveMinor: number;
  /** What stays in Spend from this allowance. */
  spendMinor: number;
  /** Why this split: to keep the goal on track, or the saving habit. */
  reason: "goal" | "habit";
};

/** Without a goal, this share of the allowance goes to Save. */
export const HABIT_SHARE = 0.3;
/** Never more than this share of the allowance in Save, whatever the goal plan says. */
export const MAX_SAVE_SHARE = 0.6;

/** The amounts the plan rounds to: half a unit (50p, 50¢) or, with no minor units, ten. */
export function planStep(currency: string): number {
  const digits = minorDigits(currency);
  return digits === 0 ? 10 : 10 ** digits / 2;
}

/**
 * The split to propose, or null when there is nothing worth proposing: the parent already put
 * enough into Save, Spend has nothing free, or the rounded amount comes to less than a step.
 */
export function allowancePlan(input: AllowancePlanInput): AllowancePlan | null {
  const { cashMinor, savedMinor, availableSpendMinor, currency, goal } = input;
  const amount = cashMinor + savedMinor;
  if (amount <= 0 || cashMinor <= 0) return null;

  const cap = Math.floor(amount * MAX_SAVE_SHARE) - savedMinor;
  const habit = Math.round(amount * HABIT_SHARE) - savedMinor;
  let want: number;
  let reason: AllowancePlan["reason"];
  if (goal && goal.remainingMinor > 0) {
    const perAllowance =
      goal.planMinor !== null && goal.planMinor > 0 ? goal.planMinor - savedMinor : habit;
    want = Math.min(perAllowance, goal.remainingMinor);
    reason = "goal";
  } else {
    want = habit;
    reason = "habit";
  }

  const step = planStep(currency);
  const bounded = Math.min(want, cap, availableSpendMinor, cashMinor);
  const saveMinor = Math.floor(bounded / step) * step;
  if (saveMinor < step) return null;
  return { saveMinor, spendMinor: cashMinor - saveMinor, reason };
}

/** The card's fixed words. Child-facing: reading age about 10, warm, no judgement. */
export const allowancePlanCopy = {
  title: "Jarso's plan for today's pocket money",
  doIt: "Do it",
  notToday: "Not today",
  /** Under the plan when the parent set jar moves to ask first. */
  parentConfirms: "Your parent will confirm it.",
  /** Under the plan when moves are recorded at once. */
  parentTold: "Your parent gets a note.",
} as const;

/** The one line the coach says for a plan. `money` formats minor units. */
export function allowancePlanLine(
  plan: AllowancePlan,
  money: (minor: number) => string,
  goalName: string | null,
): string {
  const stays = plan.spendMinor > 0 ? ` ${money(plan.spendMinor)} stays in Spend.` : "";
  if (plan.reason === "goal" && goalName) {
    return `Pop ${money(plan.saveMinor)} into Save and your ${goalName} keeps moving.${stays}`;
  }
  return `Tuck ${money(plan.saveMinor)} into Save for later.${stays}`;
}
