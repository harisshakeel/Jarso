import { formatMoney, startOfWeek } from "@jarso/core/lib";

/**
 * Jarso noticed (demo 3): once a week the app looks at each child's week and, when something is
 * worth a word, sends one short notice to the child and one to their parents. Every signal is
 * worked out here, in code, from plain inputs; a model may only reword the child's line, and
 * every figure in it is a `{{ref}}` the app fills (ADR 0011). Nothing here judges an amount or
 * compares a child with anyone else (FR09): spending is only ever set beside the child's own
 * week before, and only for the parent.
 */

/** A handed-over allowance, and whether any of it went into Save. */
export type NoticedAllowance = { on: string; saved: boolean };

/** The child's active goal, with what counts toward it (Save less money waiting to come out). */
export type NoticedGoal = { id: string; name: string; targetMinor: number; countedMinor: number };

export type NoticedInput = {
  /** The family's local date, ISO `YYYY-MM-DD`. */
  today: string;
  /** Handed-over allowances, newest first, at most ALLOWANCES_READ. */
  allowances: readonly NoticedAllowance[];
  goal: NoticedGoal | null;
  /** Live recorded purchases in the last 7 days, and in the 7 days before. */
  spentLast7DaysMinor: number;
  spent7DaysBeforeMinor: number;
  /** The family-local day of the last recorded money movement; null when nothing ever moved. */
  lastMoveOn: string | null;
  /** Signal keys already sent to this child. */
  sentKeys: readonly string[];
};

export type GoalQuarter = 1 | 2 | 3 | 4;

export type NoticedSignal =
  | {
      kind: "goal_quarter";
      key: string;
      quarter: GoalQuarter;
      goalName: string;
      countedMinor: number;
      targetMinor: number;
    }
  | { kind: "saving_streak"; key: string; count: number }
  | { kind: "spending_jump"; key: string; thisWeekMinor: number; weekBeforeMinor: number }
  | { kind: "quiet"; key: string; days: number };

export type NoticedKind = NoticedSignal["kind"];

/** Streak lengths worth a word. A longer streak is told at the biggest mark it has passed. */
export const STREAK_MILESTONES = [3, 5, 8, 12] as const;
/** Allowances the inputs carry: one more than the biggest milestone. */
export const ALLOWANCES_READ = 13;
/** Days with nothing moving before Jarso says it is around. */
export const QUIET_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one ISO date to another (dates are calendar days, so UTC). */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

/**
 * The goal crossed a quarter mark (a quarter, half, three quarters, all of it) that has not been
 * told yet. A goal that starts at half full is told "halfway" once, never "a quarter" after.
 */
export function goalQuarterSignal(input: NoticedInput): NoticedSignal | null {
  const { goal } = input;
  if (!goal || goal.targetMinor <= 0) return null;
  const quarter = Math.min(4, Math.floor((Math.max(0, goal.countedMinor) * 4) / goal.targetMinor));
  if (quarter < 1) return null;
  const prefix = `goal_quarter:${goal.id}:`;
  const told = input.sentKeys.some(
    (key) => key.startsWith(prefix) && Number(key.slice(prefix.length)) >= quarter,
  );
  if (told) return null;
  return {
    kind: "goal_quarter",
    key: `${prefix}${quarter}`,
    quarter: quarter as GoalQuarter,
    goalName: goal.name,
    countedMinor: goal.countedMinor,
    targetMinor: goal.targetMinor,
  };
}

/**
 * Something went into Save from the newest allowances in a row, at least 3 times. Each milestone
 * is told once per streak: its key is the date of the allowance that reached it, which stays put
 * as new allowances arrive. A streak longer than the inputs reach started before them; its
 * milestones were told when they happened.
 */
export function savingStreakSignal(input: NoticedInput): NoticedSignal | null {
  const { allowances } = input;
  let count = 0;
  for (const allowance of allowances) {
    if (!allowance.saved) break;
    count += 1;
  }
  if (count === allowances.length && count >= ALLOWANCES_READ) return null;
  const milestone = [...STREAK_MILESTONES].reverse().find((m) => m <= count);
  if (!milestone) return null;
  // Newest first, so the m-th allowance from the streak's start is at index count - m.
  const reachedOn = allowances[count - milestone]?.on;
  if (!reachedOn) return null;
  const key = `saving_streak:${milestone}:${reachedOn}`;
  if (input.sentKeys.includes(key)) return null;
  return { kind: "saving_streak", key, count };
}

/**
 * The parent's only spending signal: the last 7 days came to more than twice the 7 before. Only
 * the child's own weeks are set side by side, and a week before with nothing spent never counts.
 */
export function spendingJumpSignal(input: NoticedInput): NoticedSignal | null {
  const before = input.spent7DaysBeforeMinor;
  if (before <= 0 || input.spentLast7DaysMinor <= 2 * before) return null;
  const key = `spending_jump:${startOfWeek(input.today)}`;
  if (input.sentKeys.includes(key)) return null;
  return {
    kind: "spending_jump",
    key,
    thisWeekMinor: input.spentLast7DaysMinor,
    weekBeforeMinor: before,
  };
}

/** Nothing has moved for QUIET_DAYS or more. Told once per quiet spell. */
export function quietSignal(input: NoticedInput): NoticedSignal | null {
  if (!input.lastMoveOn) return null;
  const days = daysBetween(input.lastMoveOn, input.today);
  if (days < QUIET_DAYS) return null;
  const key = `quiet:${input.lastMoveOn}`;
  if (input.sentKeys.includes(key)) return null;
  return { kind: "quiet", key, days };
}

/**
 * The one signal for this week, or null. A child hears at most one a week, so the order is the
 * priority: a goal mark, then a saving streak, then the parent's spending note, then a quiet spell.
 */
export function pickSignal(input: NoticedInput): NoticedSignal | null {
  return (
    goalQuarterSignal(input) ??
    savingStreakSignal(input) ??
    spendingJumpSignal(input) ??
    quietSignal(input)
  );
}

/** Where a nudge opens. */
export type NoticedOpen = "goal" | "jarso" | "home" | "child" | "history";

/** One notice: the title is fixed copy; the detail may hold `{{refs}}` from `facts`. */
export type NoticedLine = { title: string; detail: string; open: NoticedOpen };

export type NoticedLines = {
  /** Ref key → the figure as shown ("£25", "3"). */
  facts: ReadonlyArray<readonly [string, string]>;
  /** Null when the signal is for the parents only. */
  child: NoticedLine | null;
  parent: NoticedLine;
};

/** What a stored nudge carries, per recipient. */
export type NoticedPayload = {
  signal: NoticedKind;
  title: string;
  detail: string;
  open: NoticedOpen;
  /** True when Claude reworded the child's line (and the output screen passed it). */
  worded: boolean;
};

/** Longest detail line a nudge may carry once its refs are filled. */
export const NOTICED_MAX_DETAIL = 160;

const CHILD_GOAL_TITLE: Record<GoalQuarter, (goal: string) => string> = {
  1: (goal) => `A quarter of the way to ${goal}`,
  2: (goal) => `Halfway to ${goal}`,
  3: (goal) => `Three quarters of the way to ${goal}`,
  4: (goal) => `You've saved enough for ${goal}`,
};

const PARENT_GOAL_TITLE: Record<GoalQuarter, (name: string, goal: string) => string> = {
  1: (name, goal) => `${name} is a quarter of the way to ${goal}`,
  2: (name, goal) => `${name} is halfway to ${goal}`,
  3: (name, goal) => `${name} is three quarters of the way to ${goal}`,
  4: (name, goal) => `${name} has saved enough for ${goal}`,
};

/**
 * The fixed lines for a signal, in Jarso's voice (docs/design.md §9): child copy at a reading age
 * of about 10, warm, no exclamation marks; parent copy in plain sentences. Figures are refs.
 */
export function noticedLines(
  signal: NoticedSignal,
  { nickname, currency, guideOn }: { nickname: string; currency: string; guideOn: boolean },
): NoticedLines {
  const name = nickname.trim() || "Your child";
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });

  switch (signal.kind) {
    case "goal_quarter": {
      const reached = signal.quarter === 4;
      return {
        facts: [
          ["goal.saved", money(signal.countedMinor)],
          ["goal.price", money(signal.targetMinor)],
        ],
        child: {
          title: CHILD_GOAL_TITLE[signal.quarter](signal.goalName),
          detail: reached
            ? "{{goal.saved}} in Save covers the {{goal.price}}. Have a look at your goal."
            : "{{goal.saved}} of {{goal.price}} counts toward it now. Steady saving adds up.",
          open: "goal",
        },
        parent: {
          title: PARENT_GOAL_TITLE[signal.quarter](name, signal.goalName),
          detail: "{{goal.saved}} of {{goal.price}} counts toward it.",
          open: "child",
        },
      };
    }
    case "saving_streak":
      return {
        facts: [["streak.count", String(signal.count)]],
        child: {
          title: `${signal.count} allowances in a row with some saved`,
          detail:
            "You put something in Save from each of your last {{streak.count}} allowances. That adds up.",
          open: "home",
        },
        parent: {
          title: `${name} saved from ${signal.count} allowances in a row`,
          detail: "Something went into Save each time. Worth a mention.",
          open: "child",
        },
      };
    case "spending_jump":
      return {
        facts: [
          ["spend.this_week", money(signal.thisWeekMinor)],
          ["spend.week_before", money(signal.weekBeforeMinor)],
        ],
        child: null,
        parent: {
          title: `${name} spent more this week`,
          detail:
            "{{spend.this_week}} in the last 7 days, {{spend.week_before}} in the 7 days before. Worth a chat.",
          open: "history",
        },
      };
    case "quiet":
      return {
        facts: [["quiet.days", String(signal.days)]],
        child: guideOn
          ? {
              title: "Jarso is here if you want to look at your jars",
              detail:
                "Nothing has moved in your jars for {{quiet.days}} days. Ask Jarso anything about money.",
              open: "jarso",
            }
          : {
              title: "Your jars are here when you want a look",
              detail: "Nothing has moved in your jars for {{quiet.days}} days.",
              open: "home",
            },
        parent: {
          title: `${name}'s jars have been quiet`,
          detail: "Nothing recorded for {{quiet.days}} days. A good moment to look together.",
          open: "child",
        },
      };
  }
}
