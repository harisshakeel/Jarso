// This week's spending as picture bars for the child's Diary. Pure; no judging, no comparing.
import type { HistoryItem } from "./types";
import { spendingByCategory } from "./where-it-went";

export type WeekBar = {
  key: string;
  emoji: string;
  label: string;
  totalMinor: number;
  /** Width against the biggest bar, 0..1. */
  share: number;
};

/** Up to `max` category bars (the biggest has share 1) and everything spent this week. */
export function weekSpentBars(
  history: readonly HistoryItem[],
  today: string,
  max = 3,
): { totalMinor: number; bars: WeekBar[] } {
  const rows = spendingByCategory(history, today);
  const totalMinor = rows.reduce((sum, row) => sum + row.totalMinor, 0);
  const top = rows[0]?.totalMinor ?? 0;
  const bars = rows
    .slice(0, max)
    .map((row) => ({ ...row, share: top > 0 ? row.totalMinor / top : 0 }));
  return { totalMinor, bars };
}

export const weekSpentCopy = {
  heading: "This week you spent",
  empty: "Nothing spent yet",
};
