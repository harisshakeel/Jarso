import { addDays } from "@/lib";

/** Days without learning before Home offers one small task instead of the next mission. */
export const COMEBACK_AFTER_DAYS = 3;

/**
 * FR12: after missed days, the child comes back to one manageable task. True when the last
 * learning day is this many days ago or more; false before any learning. Never phrased as a
 * streak lost.
 */
export function isComeback(lastLearnedOn: string | null, today: string): boolean {
  if (!lastLearnedOn) return false;
  return lastLearnedOn <= addDays(today, -COMEBACK_AFTER_DAYS);
}
