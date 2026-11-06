import { addDays, startOfWeek } from "@jarso/core/lib";
import { jarsoFill } from "@jarso/core/mascot";
import type { BalanceHistory, BalancePoint } from "./balance-history";
import type { Jar } from "./types";

// The jar page's bars: how much a jar changed over each of the last few weeks. Pure, and
// built from the daily history the app already has (no second walk back through the ledger).

export const WEEKS_SHOWN = 6;

/** One bar: how much the jar changed over one family-local Monday-Sunday week. */
export type WeekTotal = {
  /** Monday, ISO date. */
  weekStart: string;
  /** "Oct 5", "12", "19", "26", "Nov 2", "This week". */
  label: string;
  /** Closing balance at min(Sunday, today) minus closing balance the Sunday before; may be negative. */
  amountMinor: number;
  /** The week that contains `today`. */
  current: boolean;
};

function dayLabel(isoDate: string, withMonth: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    ...(withMonth ? { month: "short" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Where `jar` stood at the end of each of the last `weeks` weeks, oldest first. */
export function weeklyTotals(
  history: BalanceHistory,
  jar: Jar,
  today: string,
  weeks: number = WEEKS_SHOWN,
): WeekTotal[] {
  const byDate = new Map<string, BalancePoint>(history.points.map((p) => [p.date, p]));
  const first = history.points[0];
  const last = history.points.at(-1);
  const balanceOn = (date: string): number => {
    const point = byDate.get(date);
    if (point) return point[jar];
    // Before the history begins a day reads as the first point's balance; after it ends, the last's.
    if (!first || !last) return 0;
    return date < first.date ? first[jar] : last[jar];
  };

  const thisWeek = startOfWeek(today);
  const totals: WeekTotal[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(thisWeek, -7 * i);
    const sunday = addDays(weekStart, 6);
    const end = sunday < today ? sunday : today;
    const current = weekStart === thisWeek;
    const before = totals.at(-1);
    const monthChanged = !before || before.weekStart.slice(0, 7) !== weekStart.slice(0, 7);
    totals.push({
      weekStart,
      label: current ? "This week" : dayLabel(weekStart, monthChanged),
      amountMinor: balanceOn(end) - balanceOn(addDays(weekStart, -1)),
      current,
    });
  }
  return totals;
}

/** The one sentence under the bars (at most 8 words, never sad, never cheering spending). */
export function weekLine(totals: WeekTotal[], jar: Jar, money: (minor: number) => string): string {
  const cur = totals.at(-1)?.amountMinor ?? 0;
  const prev = totals.at(-2)?.amountMinor ?? 0;
  if (totals.every((week) => week.amountMinor === 0)) {
    return jar === "save" ? "Your first save shows here." : "Nothing moved yet.";
  }
  if (jar === "save") {
    if (cur > 0 && cur > prev) return `${money(cur - prev)} more than last week!`;
    if (cur === prev) return "Same as last week. Steady!";
    if (cur < 0) return "You used some savings.";
    return "Every coin counts. Keep going!";
  }
  // Bars are net changes, so say what the jar did, not whether spending was more or less.
  if (cur > prev) return `Spend grew ${money(cur - prev)} more than last week.`;
  if (cur < prev) return `Spend dropped ${money(prev - cur)} more than last week.`;
  return "Same as last week.";
}

/** True when this week is above zero and above every earlier week shown. */
export function isBestWeek(totals: WeekTotal[]): boolean {
  const cur = totals.at(-1);
  if (!cur || cur.amountMinor <= 0) return false;
  return totals.slice(0, -1).every((week) => week.amountMinor < cur.amountMinor);
}

/**
 * How full the big jar looks, 0..1: Save as Jarso on Home (goal ratio, else share of both);
 * Spend its share of both. One formula, swapped.
 */
export function jarPageFill(
  jar: Jar,
  input: { spendMinor: number; saveMinor: number; goalTargetMinor: number | null },
): number {
  if (jar === "save") return jarsoFill(input);
  return jarsoFill({
    saveMinor: input.spendMinor,
    spendMinor: input.saveMinor,
    goalTargetMinor: null,
  });
}
