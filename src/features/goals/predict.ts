import { goalProgress } from "./progress";

/**
 * Predict before deciding (FR05): what a move does to the goal, worked out before any money
 * moves. Pure arithmetic over the same goal maths as the jar, so the prediction's reveal and the
 * screen after the move always agree. Nothing here writes.
 */

export type Move = "take_out" | "put_in" | "change_plan";

export type PredictInput = {
  move: Move;
  amountMinor: number;
  saveMinor: number;
  reservedMinor: number;
  targetMinor: number;
  planMinor: number | null;
};

/** The three answers the child can pick before seeing the real one. */
export const PREDICTIONS = ["further", "same", "closer"] as const;
export type Prediction = (typeof PREDICTIONS)[number];

export type Outcome = {
  /** What actually happens to the estimate. */
  actual: Prediction;
  /** Allowances to go before and after (null without a positive plan). */
  before: number | null;
  after: number | null;
  /** Money still needed before and after. */
  remainingBefore: number;
  remainingAfter: number;
};

/**
 * The outcome of a move on the goal's estimate. A take-out moves counted money out of Save; a
 * put-in brings it in; a plan change changes the per-allowance amount and nothing else.
 */
export function predictOutcome(input: PredictInput): Outcome {
  const { move, amountMinor, saveMinor, reservedMinor, targetMinor, planMinor } = input;
  const before = goalProgress({ saveMinor, reservedMinor, targetMinor, planMinor });
  const after =
    move === "take_out"
      ? goalProgress({ saveMinor: saveMinor - amountMinor, reservedMinor, targetMinor, planMinor })
      : move === "put_in"
        ? goalProgress({
            saveMinor: saveMinor + amountMinor,
            reservedMinor,
            targetMinor,
            planMinor,
          })
        : goalProgress({ saveMinor, reservedMinor, targetMinor, planMinor: amountMinor });

  const estimate = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
  const actual: Prediction =
    estimate(after.paymentsLeft) < estimate(before.paymentsLeft)
      ? "closer"
      : estimate(after.paymentsLeft) > estimate(before.paymentsLeft)
        ? "further"
        : after.remainingMinor < before.remainingMinor
          ? "closer"
          : after.remainingMinor > before.remainingMinor
            ? "further"
            : "same";
  return {
    actual,
    before: before.paymentsLeft,
    after: after.paymentsLeft,
    remainingBefore: before.remainingMinor,
    remainingAfter: after.remainingMinor,
  };
}

/** What the child reads once the real answer shows. Plain, never judging the choice. */
export function explainOutcome(
  outcome: Outcome,
  goalName: string,
  money: (minor: number) => string,
): string {
  const allowances = (n: number) => `${n} allowance${n === 1 ? "" : "s"}`;
  if (outcome.after === 0) return `You'd have enough for your ${goalName}.`;
  if (outcome.actual === "same") {
    return `Your ${goalName} stays just where it is: ${money(outcome.remainingAfter)} to go.`;
  }
  if (outcome.before !== null && outcome.after !== null && outcome.before !== outcome.after) {
    const direction = outcome.actual === "closer" ? "closer" : "further off";
    return `Your ${goalName} would be about ${allowances(outcome.after)} away instead of ${allowances(outcome.before)}: ${direction}.`;
  }
  const direction = outcome.actual === "closer" ? "less" : "more";
  return `You'd need ${money(outcome.remainingAfter)} ${direction === "less" ? "" : "more "}for your ${goalName}, ${direction} than now (${money(outcome.remainingBefore)}).`;
}
