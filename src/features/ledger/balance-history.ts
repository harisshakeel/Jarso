import { addDays } from "@/lib";
import type { Jar, Jars } from "./types";

// How the jars moved, day by day (child Home's graph). Pure: the server reads the movements
// and today's balances, this works out where each jar stood at the end of every day.

/** One recorded ledger line, reduced to what moves a balance. */
export type JarMovement = {
  jar: Jar;
  direction: "in" | "out";
  amountMinor: number;
  /** The family-local ISO date the line happened on. */
  occurredOn: string;
};

/** Where both jars stood at the end of one day, in minor units. */
export type BalancePoint = { date: string; spend: number; save: number };

export type BalanceHistory = {
  /** Oldest first, one point per day, ending today. */
  points: BalancePoint[];
  /** Days on which something moved, so the graph can mark them. */
  movedOn: string[];
};

/** The periods the graph offers, in days back from today. */
export const graphPeriods = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 3 months" },
] as const;
export type GraphPeriod = (typeof graphPeriods)[number]["days"];

/**
 * Walks back from today's balances through the movements, so the series always ends at the
 * figures the jars show and earlier days follow from them. Movements before `from` are not
 * needed: the first day's closing balance is whatever is left after undoing the later ones.
 */
export function balanceHistory(
  current: Jars,
  movements: JarMovement[],
  from: string,
  today: string,
): BalanceHistory {
  const net = new Map<string, Jars>();
  for (const move of movements) {
    if (move.occurredOn < from || move.occurredOn > today) continue;
    const day = net.get(move.occurredOn) ?? { spend: 0, save: 0 };
    day[move.jar] += move.direction === "in" ? move.amountMinor : -move.amountMinor;
    net.set(move.occurredOn, day);
  }
  const points: BalancePoint[] = [];
  let spend = current.spend;
  let save = current.save;
  for (let date = today; date >= from; date = addDays(date, -1)) {
    points.push({ date, spend, save });
    const day = net.get(date);
    if (day) {
      spend -= day.spend;
      save -= day.save;
    }
  }
  points.reverse();
  return { points, movedOn: [...net.keys()].sort() };
}

/** The last `days` days of a history (the graph's period), today included. */
export function lastDays(history: BalanceHistory, days: number): BalanceHistory {
  const points = history.points.slice(-days);
  const first = points[0]?.date ?? "";
  return { points, movedOn: history.movedOn.filter((date) => date >= first) };
}

/** How much each jar moved across the points, first day to last, in minor units. */
export function jarChange(points: BalancePoint[]): Jars {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return { spend: 0, save: 0 };
  return { spend: last.spend - first.spend, save: last.save - first.save };
}

/**
 * One friendly line about the period, for under the graph: which jar climbed or dipped and by
 * how much. Never a judgement of the amount.
 */
export function graphCaption(
  points: BalancePoint[],
  anyMoves: boolean,
  money: (minor: number) => string,
): string {
  if (!anyMoves) return "Nothing has moved yet. Your first allowance will show up here.";
  const change = jarChange(points);
  const line = (jar: "Spend" | "Save", by: number) =>
    by === 0
      ? `${jar} stayed put`
      : `${jar} ${by > 0 ? "climbed" : "dipped"} ${money(Math.abs(by))}`;
  if (change.spend === 0 && change.save === 0) return "Both jars stayed where they were.";
  return `${line("Spend", change.spend)}. ${line("Save", change.save)}.`;
}
