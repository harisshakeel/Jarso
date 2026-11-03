// The parent dashboard's AI-written summary (spec answer 5, 2026-11-03). Pure: the facts the
// model may use, built from the same reads as every other section, and the check its words must
// pass before a parent sees them. The facts carry nicknames, fixed category names, figures and
// dates only: no goal name, label or note a child typed, so nothing a child wrote reaches the
// model as text.
import { formatDay } from "@jarso/core/allowance";
import { addDays, formatMoney } from "@jarso/core/lib";
import { allowanceDates, categoryComparison, periodOf, saveChange } from "./build";
import type { DashboardChild, DashboardWindow } from "./types";

/** What the summary may say, about whom. */
export type SummaryFacts = {
  /** The period in words, "this week". */
  period: string;
  /** The scoped children's nicknames. */
  names: string[];
  /** One plain line per fact, every figure already written out. */
  lines: string[];
};

/** Longest summary a parent sees; a longer answer is dropped, not cut. */
export const SUMMARY_MAX = 320;

/**
 * The facts for the scoped children over the window: what waits for the parent first, then
 * spending, Save, holdings, goals and the next allowance. Each line is about one child.
 */
export function summaryFacts(
  children: DashboardChild[],
  window: DashboardWindow,
  currency: string,
  today: string,
): SummaryFacts {
  const period = periodOf(window.days);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "always" });
  const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
  const lines: string[] = [];
  for (const child of children) {
    const name = child.nickname;
    const due = child.due.filter((item) => item.dueOn <= today);
    if (due.length > 0) {
      const total = due.reduce((sum, item) => sum + item.amountMinor, 0);
      lines.push(
        `${count(due.length, "One handover", "handovers")} for ${name} ${due.length === 1 ? "is" : "are"} waiting for you: ${money(total)}.`,
      );
    }
    if (child.flaggedChats > 0) {
      lines.push(
        `${count(child.flaggedChats, "One chat", "chats")} ${name} had with Jarso this week ${child.flaggedChats === 1 ? "was" : "were"} flagged for you to read.`,
      );
    }
    const rows = categoryComparison([child], window);
    const spentNow = rows.reduce((sum, row) => sum + row.nowMinor, 0);
    const spentBefore = rows.reduce((sum, row) => sum + row.beforeMinor, 0);
    if (spentNow > 0 || spentBefore > 0) {
      lines.push(
        `${name} spent ${money(spentNow)} ${period.now} and ${money(spentBefore)} ${period.before}.`,
      );
    }
    const top = rows.find((row) => row.nowMinor > 0);
    if (top)
      lines.push(
        `${name}'s biggest spending ${period.now} was ${top.label}: ${money(top.nowMinor)}.`,
      );
    const change = saveChange(child, window);
    if (change !== null && change !== 0) {
      lines.push(
        `${name}'s Save went ${change > 0 ? "up" : "down"} by ${money(Math.abs(change))} ${period.now}.`,
      );
    }
    lines.push(
      `${name} has ${money(child.spendMinor)} in Spend and ${money(child.saveMinor)} in Save.`,
    );
    const view = child.goal;
    if (view?.progress.reached) {
      lines.push(`${name} has saved enough for their goal.`);
    } else if (view && view.progress.paymentsLeft !== null && view.progress.paymentsLeft > 0) {
      const left = view.progress.paymentsLeft;
      lines.push(`${name} is ${left} ${left === 1 ? "allowance" : "allowances"} from their goal.`);
    }
    const [next] = allowanceDates(child.schedule, today, addDays(today, 14));
    if (next && child.schedule) {
      lines.push(
        `${name}'s next allowance, ${money(child.schedule.amountMinor)}, is due on ${formatDay(next)}.`,
      );
    }
  }
  return { period: period.now, names: children.map((child) => child.nickname), lines };
}

/** Words that judge a child or an amount; the summary states what happened, never how good. */
const JUDGING =
  /\b(?:too much|too little|only|wast(?:e|ed|es|ing)|bad|naughty|lazy|greedy|careless|irresponsible|splurg\w*)\b/i;

/** A number as written in the facts: "12.40", "1,200.00", "2", the "1" of "1 Nov". */
const FIGURE = /\d+(?:[.,]\d+)*/g;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether the model's summary may be shown: short, no links or questions, no judging words, no
 * child compared with another by name, and every number in it one of the facts' own figures, whole
 * (so it never works out a figure of its own). A summary that fails is dropped; the page reads fine without.
 */
export function checkSummary(text: string, facts: SummaryFacts): boolean {
  const clean = text.trim();
  if (!clean || clean.length > SUMMARY_MAX) return false;
  if (/https?:|www\.|\?/i.test(clean) || JUDGING.test(clean)) return false;
  // Whole figures: "1" doesn't pass because "£1.50" is in the facts.
  const known = new Set(facts.lines.join("\n").match(FIGURE) ?? []);
  for (const figure of clean.match(FIGURE) ?? []) {
    if (!known.has(figure)) return false;
  }
  for (const name of facts.names) {
    const compared = new RegExp(
      `\\b(?:than|as much as|as many as)\\s+${escapeRegExp(name)}\\b`,
      "i",
    );
    if (compared.test(clean)) return false;
  }
  return true;
}
