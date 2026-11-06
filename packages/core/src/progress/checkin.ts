import { familyToday, localDateOf } from "../lib";

export type CheckinDecision = "show" | "skip" | "refresh";

/**
 * Whether Home should ask "Spend anything today?" now. `today` and every day are family-local.
 * - progress not loaded (or failed): skip (never block, never guess)
 * - asked already today (lastPromptDay === today): skip
 * - progress read on an earlier family day: refresh (its checkedInToday is about that day)
 * - checkedInToday: skip; otherwise show
 */
export function checkinDecision(input: {
  timezone: string;
  now: Date;
  lastPromptDay: string | null;
  progress: { checkedInToday: boolean; readAt: Date } | null;
}): CheckinDecision {
  const { timezone, now, lastPromptDay, progress } = input;
  if (!progress) return "skip";
  const today = familyToday(timezone, now);
  if (lastPromptDay === today) return "skip";
  if (localDateOf(progress.readAt, timezone) !== today) return "refresh";
  return progress.checkedInToday ? "skip" : "show";
}
