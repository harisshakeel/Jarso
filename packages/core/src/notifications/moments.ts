// The child's big moments (2026-11-04), shown at the top of Updates beside their notices: a
// mission finished, pocket money or a gift that came in, a goal reached, a new longest run. Pure:
// built from reads the app already makes, never stored. Praise in words, never a score (the
// child's copy keeps scores for the parent), and nothing is compared with anyone else.
import type { GoalView } from "@jarso/core/goals";
import type { LearningOverview } from "@jarso/core/learning";
import { praiseLine } from "@jarso/core/learning";
import type { HistoryItem } from "@jarso/core/ledger";
import { addDays, formatMoney } from "@jarso/core/lib";

export type MomentKind = "mission" | "allowance" | "gift" | "extra" | "goal" | "best";

export type Moment = {
  id: string;
  kind: MomentKind;
  /** The day it happened (a goal: null; it always leads the list). */
  on: string | null;
  title: string;
  detail: string;
};

/** How far back the moments go. */
export const MOMENT_DAYS = 30;
/** At most this many, newest first. */
export const MOMENT_LIMIT = 8;

export function bigMoments(input: {
  history: readonly HistoryItem[];
  learning: Pick<
    LearningOverview,
    "completed" | "streak" | "longestStreak" | "lastLearnedOn"
  > | null;
  goal: GoalView;
  today: string;
  currency: string;
}): Moment[] {
  const { history, learning, goal, today, currency } = input;
  const since = addDays(today, -MOMENT_DAYS);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const moments: Moment[] = [];

  for (const mission of learning?.completed ?? []) {
    if (mission.completedOn < since) continue;
    moments.push({
      id: `mission-${mission.attemptId}`,
      kind: "mission",
      on: mission.completedOn,
      title: `You finished ${mission.title}`,
      detail: praiseLine(mission),
    });
  }

  for (const item of history) {
    if (item.occurredOn < since || item.undone || !item.amountMinor || item.amountMinor <= 0) {
      continue;
    }
    if (item.kind === "allowance") {
      moments.push({
        id: `allowance-${item.id}`,
        kind: "allowance",
        on: item.occurredOn,
        title: "Your pocket money came in",
        detail: money(item.amountMinor),
      });
    } else if (item.kind === "gift") {
      moments.push({
        id: `gift-${item.id}`,
        kind: "gift",
        on: item.occurredOn,
        title: item.label && item.label !== "Gift" ? `A gift: ${item.label}` : "You got a gift",
        detail: money(item.amountMinor),
      });
    } else if (item.kind === "extra") {
      moments.push({
        id: `extra-${item.id}`,
        kind: "extra",
        on: item.occurredOn,
        title: "Extra money came in",
        detail: money(item.amountMinor),
      });
    }
  }

  // A run of three or more that is also the longest ever: a personal best, never a ranking.
  if (
    learning &&
    learning.streak >= 3 &&
    learning.streak === learning.longestStreak &&
    learning.lastLearnedOn
  ) {
    moments.push({
      id: `best-${learning.streak}`,
      kind: "best",
      on: learning.lastLearnedOn,
      title: `Your longest run yet: ${learning.streak} days in a row`,
      detail: "Showing up is the hard part.",
    });
  }

  const sorted = moments.sort((a, b) => (b.on ?? "").localeCompare(a.on ?? ""));
  // A goal reached leads: it is the biggest moment. Only the last month's, like the rest.
  const reachedOn = goal?.goal.reachedAt?.slice(0, 10) ?? null;
  if (goal?.progress.reached && (reachedOn === null || reachedOn >= since)) {
    sorted.unshift({
      id: `goal-${goal.goal.id}`,
      kind: "goal",
      on: null,
      title: `You reached your goal: ${goal.goal.emoji} ${goal.goal.name}`,
      detail: "You saved it up yourself.",
    });
  }
  return sorted.slice(0, MOMENT_LIMIT);
}

/** The words around the moments. */
export const momentsCopy = {
  heading: "Big moments",
  notices: "Messages",
  none: "Finish a mission or save towards your goal, and your big moments show up here.",
} as const;
