// The parent's learning view (2026-11-04: "the dashboard should focus on learning the most").
// Pure: a child's learning overview, read once, turned into what Home's cards, the Children page
// and Jarso's summary say. Mission titles and skill names are fixed content, never text a child
// typed. Nothing here compares one child with another or judges how they did.
import { formatDay } from "@jarso/core/allowance";
import { skills as allSkills, type LearningOverview, summaryLine } from "@jarso/core/learning";
import { formatMoney, startOfWeek } from "@jarso/core/lib";
import type { SummaryFacts } from "./summary";
import type { DashboardChild } from "./types";

/** One finished mission, as the parent reads how it went. */
export type MissionFeedback = {
  title: string;
  completedOn: string;
  firstTry: number;
  answerable: number;
  hints: number;
};

/** A child's learning at a glance. */
export type LearningSnapshot = {
  daysThisWeek: number;
  streak: number;
  points: number;
  /** Missions finished since Monday, newest first. */
  thisWeek: MissionFeedback[];
  /** The newest finished mission, this week or before; null before any. */
  latest: MissionFeedback | null;
  skillsLearned: number;
  skillsTotal: number;
  practiceDue: number;
  /** What the child does next, in words for a parent; null when every mission is done. */
  next: string | null;
  checkInDone: boolean;
};

/** A child with their learning, for the parent's pages. */
export type ChildLearning = {
  childId: string;
  nickname: string;
  slot: number;
  overview: LearningOverview;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The next step in a parent's words. */
function nextLine(overview: LearningOverview): string | null {
  const step = overview.nextStep;
  switch (step.kind) {
    case "resume":
      return `Halfway through ${step.title}`;
    case "mission":
      return `Next mission: ${step.title}`;
    case "check-in":
      return "Starting check-in not done yet";
    case "practice":
      return `${plural(step.count, "practice question")} waiting`;
    case "comeback":
      return "One quick question to ease back in";
    default:
      return null;
  }
}

export function learningSnapshot(overview: LearningOverview, today: string): LearningSnapshot {
  const monday = startOfWeek(today);
  const feedback = overview.completed.map(
    ({ title, completedOn, firstTry, answerable, hints }): MissionFeedback => ({
      title,
      completedOn,
      firstTry,
      answerable,
      hints,
    }),
  );
  return {
    daysThisWeek: overview.daysThisWeek,
    streak: overview.streak,
    points: overview.points,
    thisWeek: feedback.filter((mission) => mission.completedOn >= monday),
    latest: feedback[0] ?? null,
    skillsLearned: overview.skills.filter((skill) => skill.level === 3).length,
    skillsTotal: allSkills.length,
    practiceDue: overview.practiceDue,
    next: nextLine(overview),
    checkInDone: overview.checkIn !== null,
  };
}

/** The parent's words for the learning cards. */
export const learningCardCopy = {
  title: "This week's learning",
  childrenIntro: "How each child is learning: lessons, how they went, and what's next.",
  week: (days: number) =>
    days === 0 ? "No lessons yet this week" : `Learned on ${plural(days, "day")} this week`,
  streak: (days: number) => `${days} days in a row`,
  points: (points: number) => plural(points, "point"),
  /** "What's in Spend, 3 Nov: 5 of 7 first try. 1 hint." */
  feedback: (mission: MissionFeedback) =>
    `${mission.title}, ${formatDay(mission.completedOn)}: ${summaryLine(mission)}`,
  lastLesson: "Last lesson",
  noLessons: "No lessons finished yet.",
  skills: (learned: number, total: number) => `${learned} of ${total} skills learned`,
  practice: (count: number) => `${plural(count, "practice question")} waiting`,
  allDone: "Every mission done",
  recent: "Recent lessons",
  checkInDone: "Starting check-in done",
  seeLearning: "See their learning",
  unavailable: "Learning couldn't load just now. Refresh to try again.",
} as const;

/**
 * The facts Jarso's summary on Home may use (2026-11-04): each child's learning first, how
 * their lessons went and what's next, then only what waits for the parent (handovers due and
 * chats flagged). Money in detail lives on the Money page, so it stays out of here.
 */
export function homeSummaryFacts(
  learning: ChildLearning[],
  reads: DashboardChild[],
  currency: string,
  today: string,
): SummaryFacts {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "always" });
  const lines: string[] = [];
  for (const child of learning) {
    const name = child.nickname;
    const snap = learningSnapshot(child.overview, today);
    lines.push(
      snap.daysThisWeek === 0
        ? `${name} hasn't done a lesson yet this week.`
        : `${name} learned on ${plural(snap.daysThisWeek, "day")} this week.`,
    );
    if (snap.streak >= 2) lines.push(`${name} has learned ${snap.streak} days in a row.`);
    for (const mission of snap.thisWeek.slice(0, 2)) {
      const hints = mission.hints === 0 ? "no hints" : plural(mission.hints, "hint");
      lines.push(
        `${name} finished ${mission.title} on ${formatDay(mission.completedOn)}: ${mission.firstTry} of ${mission.answerable} right first time, with ${hints}.`,
      );
    }
    lines.push(`${name} has learned ${snap.skillsLearned} of ${snap.skillsTotal} skills.`);
    if (snap.practiceDue > 0) {
      lines.push(`${name} has ${plural(snap.practiceDue, "practice question")} waiting.`);
    }
    const step = child.overview.nextStep;
    if (step.kind === "mission" || step.kind === "resume") {
      lines.push(`${name}'s next mission is ${step.title}.`);
    } else if (step.kind === "check-in") {
      lines.push(`${name} hasn't done the starting check-in yet.`);
    }
    const kid = reads.find((m) => m.id === child.childId);
    const due = kid?.due.filter((item) => item.dueOn <= today) ?? [];
    if (due.length > 0) {
      const total = due.reduce((sum, item) => sum + item.amountMinor, 0);
      lines.push(
        `${due.length === 1 ? "One handover" : `${due.length} handovers`} for ${name} ${due.length === 1 ? "is" : "are"} waiting for you: ${money(total)}.`,
      );
    }
    if (kid && kid.flaggedChats > 0) {
      const n = kid.flaggedChats;
      lines.push(
        `${n === 1 ? "One chat" : `${n} chats`} ${name} had with Jarso this week ${n === 1 ? "was" : "were"} flagged for you to read.`,
      );
    }
  }
  return { period: "this week", names: learning.map((child) => child.nickname), lines };
}
