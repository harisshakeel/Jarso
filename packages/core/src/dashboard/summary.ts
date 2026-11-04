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

// Windows-1252's characters for the bytes 0x80–0x9F, where it differs from Latin-1.
const CP1252: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

/** The byte a character stands for when UTF-8 was read one byte per character, or -1. */
function byteOf(char: string): number {
  const code = char.codePointAt(0) ?? -1;
  return code <= 0xff ? code : (CP1252[char] ?? -1);
}

/**
 * Text whose UTF-8 was read as Latin-1 or Windows-1252 ("â‚¹" for "₹"), put back. Only a whole,
 * valid multi-byte sequence is changed, so "Zoë" or "£" written correctly stay as they are.
 */
function repairMisreadUtf8(text: string): string {
  const chars = Array.from(text);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const lead = byteOf(chars[i] as string);
    const extra = lead >= 0xf0 && lead <= 0xf4 ? 3 : lead >= 0xe0 ? 2 : lead >= 0xc2 ? 1 : 0;
    if (lead < 0xc2 || lead > 0xf4) {
      out += chars[i];
      continue;
    }
    let code = lead & (extra === 3 ? 0x07 : extra === 2 ? 0x0f : 0x1f);
    let whole = i + extra < chars.length;
    for (let k = 1; whole && k <= extra; k++) {
      const next = byteOf(chars[i + k] as string);
      if (next < 0x80 || next > 0xbf) whole = false;
      else code = (code << 6) | (next & 0x3f);
    }
    const lowest = extra === 3 ? 0x10000 : extra === 2 ? 0x800 : 0x80;
    if (whole && code >= lowest && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
      out += String.fromCodePoint(code);
      i += extra;
    } else {
      out += chars[i];
    }
  }
  return out;
}

/** Punctuation a model writes on its own: curly quotes, dashes, an ellipsis, a no-break space. */
const TYPOGRAPHY = "\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00a0";

/**
 * The model's summary as a parent may read it, or null: misread UTF-8 put back ("â‚¹750.00" was
 * once shown for "₹750.00"), then `checkSummary`, and no character outside ASCII that the facts
 * never use, so a currency sign or name can't reach the page garbled.
 */
export function readableSummary(text: string, facts: SummaryFacts): string | null {
  const repaired = repairMisreadUtf8(text).trim();
  if (!checkSummary(repaired, facts)) return null;
  const known = new Set(
    Array.from([...facts.lines, ...facts.names, facts.period, TYPOGRAPHY].join("")),
  );
  for (const char of repaired) {
    if (char.charCodeAt(0) > 0x7f && !known.has(char)) return null;
  }
  return repaired;
}
