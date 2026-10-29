import { addDays, localDateOf, startOfWeek } from "@/lib";
import { needsReplay } from "./grade";
import type { SkillKey } from "./skills";
import type { AnswerableStep, JourneyMission, Mission, NextStep, StepResult } from "./types";

/** Pure journey rules (spec §4.2), shared by the pages, the player and the tests. */

type AttemptSummary = {
  missionKey: string;
  status: "started" | "completed" | "abandoned";
  completedAt: string | null;
};

/**
 * Path statuses: a completed mission is done, the first one not done is current, and every
 * mission after it is locked. There is no day gate: a child may go on to the next mission.
 */
export function buildJourney(
  missions: readonly Mission[],
  attempts: readonly AttemptSummary[],
  timezone: string,
): JourneyMission[] {
  const completedAt = new Map<string, string>();
  const open = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.status === "completed" && attempt.completedAt) {
      const previous = completedAt.get(attempt.missionKey);
      if (!previous || attempt.completedAt > previous)
        completedAt.set(attempt.missionKey, attempt.completedAt);
    }
    if (attempt.status === "started") open.add(attempt.missionKey);
  }
  let currentFound = false;
  return missions.map((mission) => {
    const done = completedAt.get(mission.key);
    let status: JourneyMission["status"];
    if (done) status = "done";
    else if (!currentFound) {
      status = "current";
      currentFound = true;
    } else status = "locked";
    return {
      key: mission.key,
      day: mission.day,
      title: mission.title,
      topic: mission.topic,
      summary: mission.summary,
      status,
      inProgress: open.has(mission.key),
      completedOn: done ? localDateOf(done, timezone) : null,
    };
  });
}

/** Whether a child may open a mission: done ones replay, the current one starts, locked ones wait. */
export function canOpenMission(journey: readonly JourneyMission[], key: string): boolean {
  const mission = journey.find((m) => m.key === key);
  return !!mission && mission.status !== "locked";
}

/**
 * FR12 order: an unfinished mission, due practice, the check-in before the first mission, then
 * the next mission. After missed days this still offers one thing, never a backlog.
 */
export function chooseNextStep(
  journey: readonly JourneyMission[],
  checkInDone: boolean,
  practiceDue: number,
): NextStep {
  const resume = journey.find((m) => m.inProgress && m.status === "current");
  if (resume) return { kind: "resume", missionKey: resume.key, title: resume.title };
  if (practiceDue > 0) return { kind: "practice", count: practiceDue };
  const current = journey.find((m) => m.status === "current");
  const started = journey.some((m) => m.status === "done");
  if (!checkInDone && !started) return { kind: "check-in" };
  if (current)
    return { kind: "mission", missionKey: current.key, title: current.title, day: current.day };
  return { kind: "done" };
}

export type PlayerPosition =
  | { phase: "main"; index: number }
  | { phase: "replay"; queue: string[] }
  | { phase: "finished" };

/**
 * Where a mission picks up: after the last step with a main result; once every main step is
 * answered, the replay queue is every step not right first time that has no replay result yet.
 */
export function resumePosition(
  mission: Pick<Mission, "steps">,
  results: readonly StepResult[],
): PlayerPosition {
  const main = new Map(results.filter((r) => r.phase === "main").map((r) => [r.stepKey, r]));
  const replayed = new Set(results.filter((r) => r.phase === "replay").map((r) => r.stepKey));
  let lastAnswered = -1;
  mission.steps.forEach((step, index) => {
    if (main.has(step.key)) lastAnswered = index;
  });
  const answerable = mission.steps.filter((s): s is AnswerableStep => s.type !== "info");
  const allAnswered = answerable.every((s) => main.has(s.key));
  if (!allAnswered) {
    const next = mission.steps.findIndex(
      (step, index) => index > lastAnswered && (step.type === "info" || !main.has(step.key)),
    );
    return { phase: "main", index: next === -1 ? 0 : next };
  }
  const queue = answerable
    .filter((s) => {
      const result = main.get(s.key);
      return result && needsReplay(result) && !replayed.has(s.key);
    })
    .map((s) => s.key);
  return queue.length > 0 ? { phase: "replay", queue } : { phase: "finished" };
}

/** "6 of 7 first try. 1 hint." for a finished attempt. */
export function attemptSummary(results: readonly StepResult[]) {
  const main = results.filter((r) => r.phase === "main");
  return {
    answerable: main.length,
    firstTry: main.filter((r) => r.correct && r.tries === 1).length,
    hints: results.reduce((sum, r) => sum + r.hintsUsed, 0),
  };
}

export function summaryLine(summary: {
  answerable: number;
  firstTry: number;
  hints: number;
}): string {
  const hints =
    summary.hints === 0 ? "No hints." : summary.hints === 1 ? "1 hint." : `${summary.hints} hints.`;
  return `${summary.firstTry} of ${summary.answerable} first try. ${hints}`;
}

export const PRACTICE_SET_SIZE = 5;

/**
 * Picks a short practice set: one item per due skill (earliest due first), choosing the item the
 * child has seen least recently and never one already answered today. Items are new situations
 * from the review pool, not mission steps.
 */
export function pickPracticeItems(
  dueSkills: readonly SkillKey[],
  pool: readonly AnswerableStep[],
  history: readonly { itemKey: string; answeredOn: string }[],
  today: string,
  max: number = PRACTICE_SET_SIZE,
): AnswerableStep[] {
  const lastSeen = new Map<string, string>();
  for (const { itemKey, answeredOn } of history) {
    const previous = lastSeen.get(itemKey);
    if (!previous || answeredOn > previous) lastSeen.set(itemKey, answeredOn);
  }
  const picked: AnswerableStep[] = [];
  for (const skill of dueSkills) {
    if (picked.length >= max) break;
    const candidates = pool
      .filter((item) => item.skill === skill && lastSeen.get(item.key) !== today)
      .sort((a, b) => (lastSeen.get(a.key) ?? "").localeCompare(lastSeen.get(b.key) ?? ""));
    const choice = candidates[0];
    if (choice) picked.push(choice);
  }
  return picked;
}

/** Days with any learning this week (Monday to Sunday) in the family's timezone. */
export function daysLearnedThisWeek(
  timestamps: readonly string[],
  timezone: string,
  today: string,
): number {
  const monday = startOfWeek(today);
  const sunday = addDays(monday, 6);
  const days = new Set(
    timestamps
      .map((ts) => localDateOf(ts, timezone))
      .filter((day) => day >= monday && day <= sunday),
  );
  return days.size;
}

export function weeklyRhythmLine(days: number): string {
  if (days === 0) return "A new week. One mission is a great start.";
  return days === 1 ? "You learned on 1 day this week." : `You learned on ${days} days this week.`;
}
