// The parent Home's family board (2026-11-04): where each child stands on the seven missions,
// the family's Spend and Save jars, and how far each child is towards their goal. Pure: built
// from reads the page already makes. It places children side by side on one picture, in the
// order they were added, and never ranks them or says who is ahead.
import type { GoalView } from "@jarso/core/goals";
import type { LearningOverview } from "@jarso/core/learning";

/** A child as the board draws them: name, colour slot. */
export type BoardChild = { childId: string; nickname: string; slot: number };

/** One mission on the family road. */
export type RoadStop = { day: number; title: string };

/** Where a child stands: the index of their current stop, or `stops.length` once all are done. */
export type RoadPlace = BoardChild & { at: number; done: number; inProgress: boolean };

export type FamilyRoad = { stops: RoadStop[]; places: RoadPlace[] };

/** The seven stops (the journey is the same for every child) and each child on theirs. */
export function familyRoad(items: (BoardChild & { overview: LearningOverview })[]): FamilyRoad {
  const first = items[0]?.overview.journey ?? [];
  const stops = first.map(({ day, title }) => ({ day, title }));
  const places = items.map(({ overview, ...child }) => {
    const journey = overview.journey;
    const current = journey.findIndex((mission) => mission.status === "current");
    const done = journey.filter((mission) => mission.status === "done").length;
    return {
      ...child,
      at: current >= 0 ? current : journey.length,
      done,
      inProgress: current >= 0 && journey[current]?.inProgress === true,
    };
  });
  return { stops, places };
}

/** The children standing on one stop, in the order they were added. */
export function standingAt(road: FamilyRoad, index: number): RoadPlace[] {
  return road.places.filter((place) => place.at === index);
}

/** A child's Spend and Save, or null when the read failed. */
export type ChildJars = BoardChild & { jars: { spend: number; save: number } | null };

/** Spend and Save added up across the chosen children (null = everyone). */
export function familyJars(
  rows: readonly ChildJars[],
  pick: string | null,
): { spend: number; save: number; counted: number } {
  const chosen = rows.filter((row) => row.jars && (pick === null || row.childId === pick));
  return {
    spend: chosen.reduce((sum, row) => sum + (row.jars?.spend ?? 0), 0),
    save: chosen.reduce((sum, row) => sum + (row.jars?.save ?? 0), 0),
    counted: chosen.length,
  };
}

/** A child on the goal track: how far, in whole percent, towards the goal they set. */
export type GoalPlace = BoardChild & {
  goal: {
    name: string;
    emoji: string;
    percent: number;
    reached: boolean;
    countedMinor: number;
    targetMinor: number;
  } | null;
};

export function goalPlace(child: BoardChild, view: GoalView): GoalPlace {
  if (!view) return { ...child, goal: null };
  const percent = view.progress.reached
    ? 100
    : Math.min(99, Math.max(0, Math.floor(view.progress.fillRatio * 100)));
  return {
    ...child,
    goal: {
      name: view.goal.name,
      emoji: view.goal.emoji,
      percent,
      reached: view.progress.reached,
      countedMinor: view.progress.countedMinor,
      targetMinor: view.goal.targetMinor,
    },
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The parent's words for the board. */
export const familyBoardCopy = {
  roadTitle: "Lessons",
  roadIntro: "Where each child is on the seven missions.",
  /** "Maya: on Day 3, Spend and Save" (each child's place, for screen readers and the list). */
  place: (place: RoadPlace, stops: RoadStop[]) => {
    if (place.at >= stops.length) return `${place.nickname}: every mission done`;
    const stop = stops[place.at];
    const doing = place.inProgress ? "halfway through" : "on";
    return stop
      ? `${place.nickname}: ${doing} Day ${stop.day}, ${stop.title}`
      : `${place.nickname}: not started`;
  },
  done: (n: number) => `${plural(n, "mission")} done`,
  finished: "All done",
  jarsTitle: "Jars",
  /** Under the jars: whose money they hold. */
  jarsWho: (nickname: string | null) =>
    nickname ? `${nickname}'s Spend and Save` : "Everyone's Spend and Save, added up",
  jarsUnavailable: "Jars couldn't load just now.",
  everyone: "Everyone",
  goalsTitle: "Goals",
  goalsIntro: "How far each child is towards the goal they set.",
  noGoal: (nickname: string) => `${nickname} hasn't set a goal yet`,
  goalLine: (place: GoalPlace) =>
    place.goal
      ? place.goal.reached
        ? `${place.nickname}: ${place.goal.name}, reached`
        : `${place.nickname}: ${place.goal.name}, ${place.goal.percent}%`
      : `${place.nickname}: no goal yet`,
  noGoals: "No goals set yet. A child sets one from their Home.",
} as const;
