// Score and streak (demo 3, 2026-11-04). Both are worked out from the results the app already
// keeps, never stored, and never tied to money (invariant 11): points reward thinking, the
// streak rewards showing up. A broken streak is never called lost (FR12): the copy only ever
// says what to start today.
import { addDays, localDateOf } from "@jarso/core/lib";

/** One answered step or practice item, as the score needs it. */
export type Scored = { correct: boolean; tries: number; hintsUsed: number };

/** Points for one answer: first try with no hints is best; trying at all still counts. */
export const POINTS = { firstTry: 10, withHelp: 6, tried: 2 } as const;

export function pointsFor(result: Scored): number {
  if (!result.correct) return POINTS.tried;
  return result.tries === 1 && result.hintsUsed === 0 ? POINTS.firstTry : POINTS.withHelp;
}

/** Points across every answer given. */
export function totalPoints(results: readonly Scored[]): number {
  return results.reduce((sum, result) => sum + pointsFor(result), 0);
}

/**
 * Days in a row with any learning, ending today or yesterday (a child who learned yesterday
 * still has their run going until today is over). Zero before any learning or after a gap.
 */
export function learningStreak(
  timestamps: readonly string[],
  timezone: string,
  today: string,
): number {
  const days = new Set(timestamps.map((ts) => localDateOf(ts, timezone)));
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

/** The streak in words, never as something lost. */
export function streakLine(streak: number): string {
  if (streak === 0) return "Learn today to start a run.";
  if (streak === 1) return "1 day in a row. Come back tomorrow to make it 2.";
  return `${streak} days in a row.`;
}

/** The score in words. */
export function pointsLine(points: number): string {
  return points === 1 ? "1 point" : `${points} points`;
}
