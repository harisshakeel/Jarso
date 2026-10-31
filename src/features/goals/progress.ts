/** Where a child stands against their goal. Amounts are minor units. */
export type GoalProgress = {
  countedMinor: number;
  remainingMinor: number;
  /** About how many more allowances at the plan; null without a positive plan. */
  paymentsLeft: number | null;
  reached: boolean;
  /** 0..1, how full the Save jar is against the goal. */
  fillRatio: number;
};

/**
 * The only place goal maths lives (FR02). Counted money is Save less money waiting to come out;
 * due and pending money never counts.
 */
export function goalProgress(input: {
  saveMinor: number;
  reservedMinor: number;
  targetMinor: number;
  planMinor: number | null;
}): GoalProgress {
  const { saveMinor, reservedMinor, targetMinor, planMinor } = input;
  const countedMinor = Math.max(saveMinor - reservedMinor, 0);
  const remainingMinor = Math.max(targetMinor - countedMinor, 0);
  const paymentsLeft =
    planMinor !== null && planMinor > 0 ? Math.ceil(remainingMinor / planMinor) : null;
  return {
    countedMinor,
    remainingMinor,
    paymentsLeft,
    reached: remainingMinor === 0,
    fillRatio: targetMinor > 0 ? Math.min(countedMinor / targetMinor, 1) : 0,
  };
}
