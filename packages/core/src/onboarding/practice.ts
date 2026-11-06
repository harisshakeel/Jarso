import { minorDigits } from "../lib";

// Practice money for the intro. It lives in the screen's state only: no practice amount is ever
// recorded, so practice and recorded money never mix (domain invariant). `mode: "practice"` keeps
// the type apart from any real balance.

export type PracticeJars = { mode: "practice"; spendMinor: number; saveMinor: number };

const unit = (currency: string) => 10 ** minorDigits(currency);

/** The intro's amounts in the family's currency: 100 to start, a snack of 20, coins of 10. */
export function practiceAmounts(currency: string): {
  startMinor: number;
  snackMinor: number;
  coinMinor: number;
} {
  const one = unit(currency);
  return { startMinor: 100 * one, snackMinor: 20 * one, coinMinor: 10 * one };
}

export function startPractice(currency: string): PracticeJars {
  return { mode: "practice", spendMinor: practiceAmounts(currency).startMinor, saveMinor: 0 };
}

/** Pays for something out of practice Spend; unchanged when it costs more than Spend holds. */
export function practiceBuy(jars: PracticeJars, priceMinor: number): PracticeJars {
  if (priceMinor <= 0 || priceMinor > jars.spendMinor) return jars;
  return { ...jars, spendMinor: jars.spendMinor - priceMinor };
}

/** Moves a coin from practice Spend to practice Save, no more than Spend holds. */
export function practiceSave(jars: PracticeJars, coinMinor: number): PracticeJars {
  const moved = Math.min(Math.max(coinMinor, 0), jars.spendMinor);
  if (moved === 0) return jars;
  return { ...jars, spendMinor: jars.spendMinor - moved, saveMinor: jars.saveMinor + moved };
}

/** How full Jarso (the Save jar) is: Save over everything, 0 when both are empty. */
export function practiceFill(jars: PracticeJars): number {
  const total = jars.spendMinor + jars.saveMinor;
  return total > 0 ? jars.saveMinor / total : 0;
}

/**
 * The plan behind the intro's "about N weeks": a quarter of the allowance, rounded down to a whole
 * unit and at least one unit. Null without an allowance. The child can change it in the goal sheet.
 */
export function suggestedPlan(allowanceMinor: number | null, currency: string): number | null {
  if (allowanceMinor === null || allowanceMinor <= 0) return null;
  const one = unit(currency);
  return Math.max(Math.floor(allowanceMinor / 4 / one) * one, one);
}
