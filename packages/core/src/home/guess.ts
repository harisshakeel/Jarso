import type { Outcome } from "@jarso/core/goals";

/** Jarso's "closer or further?" guess before a goal move. */
export const guessCopy = {
  question: (emoji: string) => `${emoji} Your goal gets…`,
  further: "Further",
  closer: "Closer",
} as const;

/** The line after the real answer shows. Never shames a wrong guess; null when nothing moved. */
export function guessResult(
  outcome: Outcome,
  guess: "further" | "closer",
): { right: boolean; line: string } | null {
  if (outcome.actual === "same") return null;
  const right = outcome.actual === guess;
  const lead = right ? "Yes! " : "Good guess! ";
  const { before, after } = outcome;
  if (before !== null && after !== null && before !== after) {
    const n = Math.abs(before - after);
    return {
      right,
      line: `${lead}${n} allowance${n === 1 ? "" : "s"} ${outcome.actual}.`,
    };
  }
  return { right, line: `${lead}A bit ${outcome.actual}.` };
}
