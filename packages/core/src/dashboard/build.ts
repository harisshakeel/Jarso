// The parent's dashboard (spec 2026-11-02): family first, each child on tap. Pure: the server
// reads each child once and these functions build every section from those reads. Nothing here
// compares one child with another or judges an amount; figures are stated plainly.
import type { Frequency, Schedule } from "@jarso/core/allowance";
import { formatDay } from "@jarso/core/allowance";
import { categoryOf, type HistoryItem, SPEND_CATEGORIES } from "@jarso/core/ledger";
import { addDays, formatMoney, minorDigits, startOfWeek } from "@jarso/core/lib";
import type {
  Callout,
  CategoryRow,
  DashboardChild,
  DashboardTotals,
  DashboardWindow,
  MoneyChart,
  TaggedItem,
  TimelineEvent,
} from "./types";

/** The periods the dashboard offers, in days; the week is the default. */
export const dashboardPeriods = [
  { days: 7, label: "This week", now: "this week", before: "last week" },
  { days: 30, label: "This month", now: "this month", before: "the month before" },
  { days: 90, label: "3 months", now: "these 3 months", before: "the 3 months before" },
] as const;
export type DashboardPeriod = (typeof dashboardPeriods)[number]["days"];

/** How many children get their own colour; the rest share a neutral tone (slot 0). */
export const SERIES_SLOTS = 8;

/** Each child's fixed colour slot, by the family's order. */
export function slotFor(index: number): number {
  return index < SERIES_SLOTS ? index + 1 : 0;
}

export function periodOf(days: number): (typeof dashboardPeriods)[number] {
  return dashboardPeriods.find((p) => p.days === days) ?? dashboardPeriods[0];
}

/** The last `days` days, today included, and the same number of days before them. */
export function windowFor(days: number, today: string): DashboardWindow {
  return {
    days,
    from: addDays(today, -(days - 1)),
    to: today,
    prevFrom: addDays(today, -(2 * days - 1)),
    prevTo: addDays(today, -days),
  };
}

/** The children the page is about: one when the filter names a child of this family, else all. */
export function scopeChildren<T extends { id: string }>(
  children: T[],
  childId: string | null,
): T[] {
  if (!childId) return children;
  const one = children.filter((child) => child.id === childId);
  return one.length > 0 ? one : children;
}

const live = (item: HistoryItem) => !item.undone && item.amountMinor !== null;

/** Totals across the scoped children: what they hold, what the parent holds, handovers. */
export function dashboardTotals(children: DashboardChild[], today: string): DashboardTotals {
  const weekStart = startOfWeek(today);
  let spendMinor = 0;
  let saveMinor = 0;
  let handedOver = 0;
  let waiting = 0;
  let waitingMinor = 0;
  for (const child of children) {
    spendMinor += child.spendMinor;
    saveMinor += child.saveMinor;
    handedOver += child.history.filter(
      (item) =>
        live(item) &&
        (item.kind === "allowance" || item.kind === "gift") &&
        item.occurredOn >= weekStart &&
        item.occurredOn <= today,
    ).length;
    for (const due of child.due) {
      if (due.dueOn > today) continue;
      waiting += 1;
      waitingMinor += due.amountMinor;
    }
  }
  return { children: children.length, spendMinor, saveMinor, handedOver, waiting, waitingMinor };
}

const categoryOrder = (key: string) => SPEND_CATEGORIES.findIndex((c) => c.key === key);

/**
 * Spending by category in the period and the one before, across the scoped children. Only
 * categories with spending in either period; biggest this period first, ties in category order.
 */
export function categoryComparison(
  children: DashboardChild[],
  window: DashboardWindow,
): CategoryRow[] {
  const rows = new Map<string, CategoryRow>();
  for (const child of children) {
    for (const item of child.history) {
      if (item.kind !== "purchase" || !live(item)) continue;
      const now = item.occurredOn >= window.from && item.occurredOn <= window.to;
      const before = item.occurredOn >= window.prevFrom && item.occurredOn <= window.prevTo;
      if (!now && !before) continue;
      const category = categoryOf(item.category, "purchase");
      const row = rows.get(category.key) ?? {
        key: category.key,
        emoji: category.emoji,
        label: category.label,
        nowMinor: 0,
        beforeMinor: 0,
      };
      if (now) row.nowMinor += item.amountMinor ?? 0;
      else row.beforeMinor += item.amountMinor ?? 0;
      rows.set(category.key, row);
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.nowMinor - a.nowMinor ||
      b.beforeMinor - a.beforeMinor ||
      categoryOrder(a.key) - categoryOrder(b.key),
  );
}

/** The category whose spending changed most between the periods, or null when none did. */
export function biggestChange(rows: CategoryRow[]): CategoryRow | null {
  let best: CategoryRow | null = null;
  for (const row of rows) {
    const change = Math.abs(row.nowMinor - row.beforeMinor);
    if (change === 0) continue;
    if (!best || change > Math.abs(best.nowMinor - best.beforeMinor)) best = row;
  }
  return best;
}

/** The biggest change as one plain sentence, or a calm line when nothing was spent. */
export function categorySentence(
  rows: CategoryRow[],
  days: number,
  currency: string,
  who: string | null,
): string {
  const period = periodOf(days);
  const subject = who ?? "The children";
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "always" });
  if (rows.length === 0)
    return `${subject} recorded no spending ${period.now} or ${period.before}.`;
  const row = biggestChange(rows);
  if (!row) return `Spending was the same as ${period.before} in every category.`;
  const what = `${row.emoji} ${row.label}`;
  if (row.beforeMinor === 0) return `${what} is new ${period.now}: ${money(row.nowMinor)}.`;
  if (row.nowMinor === 0)
    return `Nothing on ${what} ${period.now}, after ${money(row.beforeMinor)} ${period.before}.`;
  const direction = row.nowMinor > row.beforeMinor ? "up" : "down";
  return `The biggest change is ${what}: ${money(row.nowMinor)} ${period.now}, ${direction} from ${money(row.beforeMinor)} ${period.before}.`;
}

/**
 * Every scoped child's history in one list, newest day first. Lines on the same day keep the
 * children's order and each child's own order, so the list never shuffles on reload.
 */
export function mergeActivity(children: DashboardChild[], limit: number): TaggedItem[] {
  const tagged = children.flatMap((child, childIndex) =>
    child.history.map((item, index) => ({
      tag: { childId: child.id, nickname: child.nickname, slot: child.slot, item },
      childIndex,
      index,
    })),
  );
  const seen = new Set<string>();
  return tagged
    .sort(
      (a, b) =>
        b.tag.item.occurredOn.localeCompare(a.tag.item.occurredOn) ||
        a.childIndex - b.childIndex ||
        a.index - b.index,
    )
    .filter(({ tag }) => {
      const key = `${tag.childId}:${tag.item.kind}:${tag.item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ tag }) => tag);
}

/** `YYYY-MM-DD` plus whole months, keeping the day where the month has it (31 Jan → 28 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

const STEP_MONTHS: Record<Exclude<Frequency, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/** The schedule's due dates after today, up to and including `until`. None when paused or stopped. */
export function allowanceDates(schedule: Schedule | null, today: string, until: string): string[] {
  if (schedule?.status !== "active" || !schedule.nextDueOn) return [];
  const dates: string[] = [];
  let next = schedule.nextDueOn;
  for (let step = 1; next <= until && dates.length < 60; step++) {
    if (next > today) dates.push(next);
    next =
      schedule.frequency === "weekly"
        ? addDays(schedule.nextDueOn, 7 * step)
        : addMonths(schedule.nextDueOn, STEP_MONTHS[schedule.frequency] * step);
  }
  return dates;
}

/**
 * The next `days` days: allowances falling due, planned gifts, and a goal the plan reaches by
 * one of those allowances. Oldest first; the same day keeps the children's order.
 */
export function timeline(
  children: DashboardChild[],
  today: string,
  currency: string,
  days = 14,
): TimelineEvent[] {
  const until = addDays(today, days);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "always" });
  const events: (TimelineEvent & { order: number })[] = [];
  children.forEach((child, order) => {
    const who = { childId: child.id, nickname: child.nickname, slot: child.slot, order };
    const dates = allowanceDates(child.schedule, today, until);
    for (const date of dates) {
      events.push({
        ...who,
        date,
        kind: "allowance",
        text: `Allowance, ${money(child.schedule?.amountMinor ?? 0)}`,
      });
    }
    for (const gift of child.gifts) {
      if (gift.status !== "pending" || gift.giveOn <= today || gift.giveOn > until) continue;
      events.push({
        ...who,
        date: gift.giveOn,
        kind: "gift",
        text: `Gift, ${money(gift.amountMinor)}${gift.note ? ` · ${gift.note}` : ""}`,
      });
    }
    const view = child.goal;
    const left = view?.progress.paymentsLeft ?? null;
    if (view && !view.progress.reached && left !== null && left > 0) {
      const reachOn = dates[left - 1];
      if (reachOn) {
        events.push({
          ...who,
          date: reachOn,
          kind: "goal",
          text: `Could reach ${view.goal.emoji} ${view.goal.name}`,
        });
      }
    }
  });
  const kindOrder = { allowance: 0, gift: 1, goal: 2 } as const;
  return events
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.order - b.order || kindOrder[a.kind] - kindOrder[b.kind],
    )
    .map(({ order: _order, ...event }) => event);
}

/** Net money into Save over the period, from the balance history; null without one. */
function saveChange(child: DashboardChild, window: DashboardWindow): number | null {
  const points = child.balances?.points ?? [];
  const start = points.find((point) => point.date >= window.from);
  const end = points.at(-1);
  if (!start || !end) return null;
  // The first point is the close of the window's first day; the day before it is the base.
  const index = points.indexOf(start);
  const base = index > 0 ? points[index - 1] : start;
  return end.save - (base?.save ?? end.save);
}

/** How many times bigger, said the way a parent would: "twice", "3 times". */
function times(now: number, before: number): string {
  const ratio = Math.floor(now / before);
  return ratio === 2 ? "twice as much" : `${ratio} times as much`;
}

/**
 * Plain observations about each scoped child, at most `limit`, in priority order: a goal in
 * reach, a spending category that at least doubled, money into Save. Each is about one child
 * and never compares children; amounts are stated, never judged.
 */
export function callouts(
  children: DashboardChild[],
  window: DashboardWindow,
  currency: string,
  limit = 4,
): Callout[] {
  const period = periodOf(window.days);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "always" });
  const goals: Callout[] = [];
  const spikes: Callout[] = [];
  const saved: Callout[] = [];
  for (const child of children) {
    const who = { childId: child.id, nickname: child.nickname, slot: child.slot };
    const view = child.goal;
    if (view?.progress.reached) {
      goals.push({
        ...who,
        id: `goal-${child.id}`,
        text: `${child.nickname} has enough for ${view.goal.emoji} ${view.goal.name}.`,
        action: "goal",
      });
    } else if (view && view.progress.paymentsLeft !== null && view.progress.paymentsLeft <= 3) {
      const left = view.progress.paymentsLeft;
      goals.push({
        ...who,
        id: `goal-${child.id}`,
        text: `${child.nickname} is ${left} ${left === 1 ? "allowance" : "allowances"} from ${view.goal.emoji} ${view.goal.name}.`,
        action: "goal",
      });
    }
    // At least doubled, and by at least one whole unit, so pennies never make a callout.
    const unit = 10 ** minorDigits(currency);
    const [spike] = categoryComparison([child], window).filter(
      (row) =>
        row.beforeMinor > 0 &&
        row.nowMinor >= 2 * row.beforeMinor &&
        row.nowMinor - row.beforeMinor >= unit,
    );
    if (spike) {
      spikes.push({
        ...who,
        id: `spike-${child.id}-${spike.key}`,
        text: `${child.nickname} spent ${times(spike.nowMinor, spike.beforeMinor)} on ${spike.emoji} ${spike.label} ${period.now} as ${period.before}: ${money(spike.nowMinor)}.`,
        action: "limit",
      });
    }
    const change = saveChange(child, window);
    if (change !== null && change > 0) {
      saved.push({
        ...who,
        id: `saved-${child.id}`,
        text: `${child.nickname}'s Save grew by ${money(change)} ${period.now}.`,
        action: "allowance",
      });
    }
  }
  return [...goals, ...spikes, ...saved].slice(0, limit);
}

/**
 * The money chart: each scoped child's Save and Spend for every day shown. The week view shows
 * this week and last week, with the split marked; the month view the last two months; the
 * three-month view the 90 days the balance history covers, with no split.
 */
export function moneyChart(children: DashboardChild[], days: number, today: string): MoneyChart {
  const shown = Math.min(days * 2, 90);
  const dates = Array.from({ length: shown }, (_, index) => addDays(today, index - (shown - 1)));
  const series = children
    .filter((child) => child.balances !== null)
    .map((child) => {
      const byDate = new Map(child.balances?.points.map((point) => [point.date, point]));
      // Before the history starts a child had nothing recorded yet.
      return {
        childId: child.id,
        nickname: child.nickname,
        slot: child.slot,
        save: dates.map((date) => byDate.get(date)?.save ?? 0),
        spend: dates.map((date) => byDate.get(date)?.spend ?? 0),
      };
    });
  return { dates, series, splitAt: days * 2 <= 90 ? addDays(today, -(days - 1)) : null };
}

/** The chart in words, for screen readers and the caption under it. */
export function moneyChartSentence(chart: MoneyChart, currency: string): string {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "always" });
  const last = chart.dates.length - 1;
  if (chart.series.length === 0 || last < 0) return "No money recorded yet.";
  const total = (index: number) =>
    chart.series.reduce((sum, s) => sum + (s.save[index] ?? 0) + (s.spend[index] ?? 0), 0);
  const first = chart.dates[0] ?? "";
  const parts = chart.series.map(
    (s) =>
      `${s.nickname} ${money((s.save[last] ?? 0) + (s.spend[last] ?? 0))} (Save ${money(s.save[last] ?? 0)}, Spend ${money(s.spend[last] ?? 0)})`,
  );
  return `${money(total(0))} on ${formatDay(first)}, ${money(total(last))} today: ${parts.join("; ")}.`;
}
