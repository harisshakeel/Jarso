// The phone's parent restyle (mobile kid rework, plan 10): the child card and the calm words
// around the Family tab. Each child is described on their own; nothing here compares children,
// shows Sparks or mentions a streak that broke.
import type { GoalView } from "@jarso/core/goals";
import { currentQuestWeek, type JourneyMission, questMap } from "@jarso/core/learning";

export type WeekMissions = { done: number; total: number };

export const familyCardsCopy = {
  needsYou: (count: number) => (count > 0 ? `Needs you · ${count}` : "Needs you"),
  children: "Children",
  spend: "Spend",
  save: "Save",
  goal: "Goal",
  noGoal: "No goal",
  level: (n: number) => `Level ${n}`,
  streak: (days: number) => `${days}-day streak`,
  missions: (done: number, total: number) => `Missions ${done}/${total}`,
  /** The child card read as one button. */
  childLabel: (nickname: string, line: string | null, spend: string, save: string, goal: string) =>
    `${nickname}.${line ? ` ${line}.` : ""} Spend ${spend}, Save ${save}, Goal ${goal}`,
  handOver: "Hand over",
  dueLine: (day: string, note: string | null) => (note ? `Due ${day} · ${note}` : `Due ${day}`),
  handoverTitle: (amount: string, nickname: string) => `${amount} to ${nickname}`,
  inboxEmpty: "Nothing new",
  inboxEmptyLine: "Asks and handovers show up here.",
  unread: (n: number) => `${n} new`,
} as const;

/** This week's quest (the child's Learn map): missions done and in the week, or null with none. */
export function weekMissions(
  journey: readonly Pick<JourneyMission, "key" | "day" | "title" | "status">[],
): WeekMissions | null {
  const week = currentQuestWeek(questMap(journey));
  return week ? { done: week.done, total: week.total } : null;
}

/** "Level 4 · 5-day streak · Missions 3/7"; unknown parts and a 0 streak are left out. */
export function childCardLine(facts: {
  level: number | null;
  streak: number | null;
  missions: WeekMissions | null;
}): string | null {
  const c = familyCardsCopy;
  const parts: string[] = [];
  if (facts.level !== null) parts.push(c.level(facts.level));
  if (facts.streak !== null && facts.streak > 0) parts.push(c.streak(facts.streak));
  if (facts.missions) parts.push(c.missions(facts.missions.done, facts.missions.total));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The goal tile, 0..100 (floored; reached is 100), or null with no goal. */
export function goalPercent(view: GoalView): number | null {
  if (!view) return null;
  if (view.progress.reached) return 100;
  return Math.min(100, Math.max(0, Math.floor(view.progress.fillRatio * 100)));
}
