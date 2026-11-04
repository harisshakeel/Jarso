// "Where your money went": this week's spending by category and money in, as plain sentences.
// Pure. Neutral on purpose: no judging, no comparing, no percentages.
import { addDays, formatMoney, startOfWeek } from "@jarso/core/lib";
import { categoryOf, SPEND_CATEGORIES } from "./categories";
import type { HistoryItem } from "./types";

export type WhereItWent = {
  spent: { headline: string; rest: string[] } | null;
  moneyIn: string | null;
  empty: string | null;
};

export type CategorySpend = { key: string; emoji: string; label: string; totalMinor: number };

function thisWeek(history: readonly HistoryItem[], today: string): HistoryItem[] {
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  return history.filter(
    (i) =>
      i.occurredOn >= weekStart &&
      i.occurredOn <= weekEnd &&
      !i.undone &&
      i.amountMinor !== null &&
      i.amountMinor > 0,
  );
}

/** This week's live purchases by category: biggest total first, ties in category order. */
export function spendingByCategory(
  history: readonly HistoryItem[],
  today: string,
): CategorySpend[] {
  const totals = new Map<string, CategorySpend>();
  for (const item of thisWeek(history, today)) {
    if (item.kind !== "purchase") continue;
    const cat = categoryOf(item.category, "purchase");
    const row = totals.get(cat.key) ?? { ...cat, totalMinor: 0 };
    row.totalMinor += item.amountMinor ?? 0;
    totals.set(cat.key, row);
  }
  const order = (key: string) => SPEND_CATEGORIES.findIndex((c) => c.key === key);
  return [...totals.values()].sort(
    (a, b) => b.totalMinor - a.totalMinor || order(a.key) - order(b.key),
  );
}

function sourceOf(item: HistoryItem): string | null {
  switch (item.kind) {
    case "allowance":
      return "allowance";
    case "gift":
      return "gift";
    case "extra":
      return "extra money";
    case "received": {
      const cat = categoryOf(item.category, "received");
      return `${cat.emoji} ${cat.label}`;
    }
    default:
      return null;
  }
}

export function whereItWent(
  history: readonly HistoryItem[],
  today: string,
  currency: string,
  opts: { showMinor?: "always" | "nonzero" } = {},
): WhereItWent {
  const { showMinor = "nonzero" } = opts;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor });

  const rows = spendingByCategory(history, today);
  let spent: WhereItWent["spent"] = null;
  const [first, ...others] = rows;
  if (first) {
    const then = others
      .slice(0, 2)
      .map((r) => `Then ${r.emoji} ${r.label}: ${money(r.totalMinor)}.`);
    const remainder = others.slice(2).reduce((sum, r) => sum + r.totalMinor, 0);
    spent = {
      headline: `Most of your spending went on ${first.emoji} ${first.label}: ${money(first.totalMinor)}.`,
      rest: remainder > 0 ? [...then, `And ${money(remainder)} on other things.`] : then,
    };
  }

  const sources = new Map<string, number>();
  for (const item of thisWeek(history, today)) {
    const name = sourceOf(item);
    if (name) sources.set(name, (sources.get(name) ?? 0) + (item.amountMinor ?? 0));
  }
  let moneyIn: string | null = null;
  if (sources.size > 0) {
    const sorted = [...sources.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [, v]) => sum + v, 0);
    const named = sorted.slice(0, 2).map(([name, v]) => `${money(v)} ${name}`);
    const rest = sorted.slice(2).reduce((sum, [, v]) => sum + v, 0);
    const parts = rest > 0 ? [...named, `and ${money(rest)} from other places`] : named;
    moneyIn = `You got ${money(total)}: ${parts.join(", ")}.`;
  }

  return { spent, moneyIn, empty: spent ? null : "Nothing spent this week yet." };
}

/**
 * The diary's highlights (2026-11-04): this week's spending and money in as two figures, and
 * the category most of it went on. The same lines "Where your money went" counts, as numbers a
 * child reads at a glance above their history.
 */
export type DiaryHighlights = {
  spentMinor: number;
  inMinor: number;
  top: CategorySpend | null;
};

export function diaryHighlights(history: readonly HistoryItem[], today: string): DiaryHighlights {
  const week = thisWeek(history, today);
  return {
    spentMinor: week
      .filter((item) => item.kind === "purchase")
      .reduce((sum, item) => sum + (item.amountMinor ?? 0), 0),
    inMinor: week
      .filter((item) => sourceOf(item) !== null)
      .reduce((sum, item) => sum + (item.amountMinor ?? 0), 0),
    top: spendingByCategory(history, today)[0] ?? null,
  };
}

/** The highlights' words. */
export const diaryHighlightsCopy = {
  heading: "This week",
  spent: "Spent",
  got: "Came in",
  mostOn: "Most went on",
  nothingYet: "Nothing yet",
} as const;
