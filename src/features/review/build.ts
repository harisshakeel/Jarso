import type { GoalView } from "@/features/goals";
import {
  type AnswerableStep,
  type ReviewItem,
  type SkillKey,
  type SkillProgress,
  skillOf,
} from "@/features/learning";
import type { HistoryItem } from "@/features/ledger";
import { addDays, formatMoney, startOfWeek } from "@/lib";
import type { DecisionLine, GoalLine, SkillNote, WeeklyReview, WeekMoney } from "./types";

/**
 * The weekly review (FR11), computed from what already exists: this week's history lines, the
 * goal, skill progress and the review pool. Pure, so it is tested as plain functions. Every line
 * follows the gamification rules (docs/roadmap.md): it praises thinking and choices, never the
 * amount, and never mentions missed days.
 */

export type BuildInput = {
  today: string;
  currency: string;
  history: readonly HistoryItem[];
  stillDueMinor: number;
  goal: GoalView;
  skills: readonly SkillProgress[];
  /** Skills whose progress row changed this week: the ones the child worked on. */
  workedOnThisWeek: readonly SkillKey[];
  reviews: readonly ReviewItem[];
  pool: readonly AnswerableStep[];
  /** Items answered recently, so the fresh question is one the child hasn't just seen. */
  recentItemKeys: readonly string[];
};

export function weekBounds(today: string): { weekStart: string; weekEnd: string } {
  const weekStart = startOfWeek(today);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export function weekMoney(
  history: readonly HistoryItem[],
  stillDueMinor: number,
  today: string,
): WeekMoney {
  const { weekStart, weekEnd } = weekBounds(today);
  let receivedMinor = 0;
  let spentMinor = 0;
  let savedMinor = 0;
  for (const item of history) {
    if (item.occurredOn < weekStart || item.occurredOn > weekEnd) continue;
    if (item.undone || item.amountMinor === null) continue;
    switch (item.kind) {
      case "allowance":
      case "gift":
      case "extra":
        receivedMinor += item.amountMinor;
        break;
      case "purchase":
        spentMinor += item.amountMinor;
        break;
      case "deposit":
        savedMinor += item.amountMinor;
        break;
      case "withdrawal":
        savedMinor -= item.amountMinor;
        break;
      default:
        break;
    }
  }
  return { weekStart, weekEnd, receivedMinor, spentMinor, savedMinor, stillDueMinor };
}

export function goalLine(goal: GoalView): GoalLine {
  if (!goal) return { kind: "none" };
  const { name, emoji, targetMinor } = goal.goal;
  if (goal.progress.reached) return { kind: "reached", name, emoji };
  return {
    kind: "progress",
    name,
    emoji,
    targetMinor,
    countedMinor: goal.progress.countedMinor,
    remainingMinor: goal.progress.remainingMinor,
    paymentsLeft: goal.progress.paymentsLeft,
  };
}

/**
 * The week's one decision worth talking about, and its effect on the plan: the largest move into
 * or out of Save, else the largest purchase. Nothing judged; the effect is stated plainly.
 */
export function decisionLine(
  history: readonly HistoryItem[],
  goal: GoalView,
  currency: string,
  today: string,
): DecisionLine | null {
  const { weekStart, weekEnd } = weekBounds(today);
  const week = history.filter(
    (i) => i.occurredOn >= weekStart && i.occurredOn <= weekEnd && !i.undone && i.amountMinor,
  );
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const plan = goal?.goal.planMinor ?? null;
  // Below half a plan rounds to nothing, so the money wording is used instead of "1 allowance".
  const allowances = (minor: number) => {
    if (!plan || plan <= 0) return null;
    const n = Math.round(minor / plan);
    return n >= 1 ? n : null;
  };
  const reached = goal?.progress.reached ?? false;
  const byAmount = (a: HistoryItem, b: HistoryItem) => (b.amountMinor ?? 0) - (a.amountMinor ?? 0);

  const move = week
    .filter((i) => i.kind === "deposit" || i.kind === "withdrawal")
    .sort(byAmount)[0];
  if (move?.amountMinor) {
    const n = allowances(move.amountMinor);
    if (move.kind === "deposit") {
      return {
        what: `You put ${money(move.amountMinor)} into Save.`,
        effect: goal
          ? reached
            ? `Your ${goal.goal.name} is already saved up; this is extra on top.`
            : n
              ? `That's about ${n} allowance${n === 1 ? "" : "s"} closer to your ${goal.goal.name}.`
              : `It all counts toward your ${goal.goal.name}.`
          : "It's kept for later now. Good thinking.",
      };
    }
    return {
      what: `You took ${money(move.amountMinor)} out of Save.`,
      effect: goal
        ? reached
          ? `Your ${goal.goal.name} is still saved up. You decided this was worth it.`
          : n
            ? `Your ${goal.goal.name} is about ${n} allowance${n === 1 ? "" : "s"} further off. You decided it was worth it.`
            : `Your ${goal.goal.name} is a bit further off. You decided it was worth it.`
        : "You chose to use it now. That's a decision too.",
    };
  }

  const purchase = week.filter((i) => i.kind === "purchase").sort(byAmount)[0];
  if (purchase?.amountMinor) {
    return {
      what: `You bought ${purchase.label} for ${money(purchase.amountMinor)}.`,
      // FR05: spending from Spend leaves the savings estimate unchanged.
      effect: goal
        ? `It came from Spend, so your ${goal.goal.name} is just where it was.`
        : "It came from Spend. Save is just where it was.",
    };
  }
  return null;
}

function note(skillKey: SkillKey, progress: readonly SkillProgress[]): SkillNote | null {
  const skill = skillOf(skillKey);
  if (!skill) return null;
  const level = progress.find((p) => p.skillKey === skillKey)?.level ?? 0;
  return { skillKey, label: skill.label, level };
}

/**
 * Understanding shown this week: the highest-level skill the child worked on (answered right at
 * least once: level 2 or 3). Levels only go up, so this never praises a wrong answer.
 */
export function understoodThisWeek(
  skills: readonly SkillProgress[],
  workedOn: readonly SkillKey[],
): SkillNote | null {
  const recent = new Set(workedOn);
  const best = skills
    .filter((s) => recent.has(s.skillKey) && s.level >= 2)
    .sort((a, b) => b.level - a.level)[0];
  return best ? note(best.skillKey, skills) : null;
}

/** A learned skill worth another look: the lowest level among those with a review, soonest first. */
export function worthPractising(
  skills: readonly SkillProgress[],
  reviews: readonly ReviewItem[],
  exclude: SkillKey | null,
): SkillNote | null {
  const learned = skills.filter((s) => s.level > 0 && s.skillKey !== exclude);
  const withReview = learned
    .map((s) => ({ s, review: reviews.find((r) => r.skillKey === s.skillKey) }))
    .filter((x) => x.review)
    .sort(
      (a, b) =>
        a.s.level - b.s.level || (a.review?.dueOn ?? "").localeCompare(b.review?.dueOn ?? ""),
    );
  const pick = withReview[0]?.s ?? learned.sort((a, b) => a.level - b.level)[0];
  return pick ? note(pick.skillKey, skills) : null;
}

/** One fresh question on a learned skill: the practise skill first, never one just answered. */
export function freshQuestion(
  pool: readonly AnswerableStep[],
  skills: readonly SkillProgress[],
  preferred: SkillKey | null,
  recentItemKeys: readonly string[],
): AnswerableStep | null {
  const recent = new Set(recentItemKeys);
  const learned = new Set(skills.filter((s) => s.level > 0).map((s) => s.skillKey));
  const candidates = pool.filter((item) => learned.has(item.skill) && !recent.has(item.key));
  return (
    candidates.find((item) => item.skill === preferred) ??
    candidates[0] ??
    pool.find((item) => learned.has(item.skill)) ??
    null
  );
}

export function buildWeeklyReview(input: BuildInput): WeeklyReview {
  const understood = understoodThisWeek(input.skills, input.workedOnThisWeek);
  const practise = worthPractising(input.skills, input.reviews, understood?.skillKey ?? null);
  return {
    money: weekMoney(input.history, input.stillDueMinor, input.today),
    goal: goalLine(input.goal),
    decision: decisionLine(input.history, input.goal, input.currency, input.today),
    understood,
    practise,
    question: freshQuestion(
      input.pool,
      input.skills,
      practise?.skillKey ?? null,
      input.recentItemKeys,
    ),
  };
}

/** The review card shows on Home from Friday to Monday: the week is nearly in, or just over. */
export function showsOnHome(today: string): boolean {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  return day === 5 || day === 6 || day === 0 || day === 1;
}
