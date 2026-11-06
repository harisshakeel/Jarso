import { addDays, startOfWeek } from "@jarso/core/lib";
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
  const balanceOn = (date: string): number => {
    const point = byDate.get(date);
    if (point) return point[jar];
    // Before the history begins a day reads as the first point's balance.
    return first ? first[jar] : 0;
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
