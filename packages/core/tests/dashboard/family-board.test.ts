import {
  familyBoardCopy,
  familyJars,
  familyRoad,
  goalPlace,
  standingAt,
} from "@jarso/core/dashboard";
import type { GoalView } from "@jarso/core/goals";
import type { JourneyMission, LearningOverview } from "@jarso/core/learning";
import { describe, expect, it } from "vitest";

const journey = (current: number, inProgress = false): JourneyMission[] =>
  Array.from({ length: 7 }, (_, index) => ({
    key: `m${index + 1}`,
    day: index + 1,
    title: `Mission ${index + 1}`,
    topic: "spend-save" as JourneyMission["topic"],
    summary: "",
    status: index < current ? "done" : index === current ? "current" : "locked",
    inProgress: index === current && inProgress,
    completedOn: index < current ? "2026-11-03" : null,
  }));

const child = (id: string, slot: number, current: number, inProgress = false) => ({
  childId: id,
  nickname: id,
  slot,
  overview: { journey: journey(current, inProgress), completed: [] } as unknown as LearningOverview,
});

describe("familyRoad", () => {
  it("stands each child on their current mission, and past the end when all are done", () => {
    const road = familyRoad([child("Maya", 0, 2, true), child("Sam", 1, 0), child("Ada", 2, 7)]);
    expect(road.stops).toHaveLength(7);
    expect(road.places.map((p) => [p.nickname, p.at, p.done])).toEqual([
      ["Maya", 2, 2],
      ["Sam", 0, 0],
      ["Ada", 7, 7],
    ]);
    expect(standingAt(road, 7).map((p) => p.nickname)).toEqual(["Ada"]);
    expect(road.places.map((place) => familyBoardCopy.place(place, road.stops))).toEqual([
      "Maya: halfway through Day 3, Mission 3",
      "Sam: on Day 1, Mission 1",
      "Ada: every mission done",
    ]);
  });

  it("carries each child's newest finished mission and how it went", () => {
    const maya = child("Maya", 0, 1);
    maya.overview = {
      ...maya.overview,
      completed: [
        {
          attemptId: "a",
          missionKey: "m1",
          title: "Mission 1",
          completedOn: "2026-11-03",
          firstTry: 5,
          answerable: 7,
          hints: 1,
        },
      ],
    };
    const [place] = familyRoad([maya, child("Sam", 1, 0)]).places;
    expect(place?.latest).toEqual({
      title: "Mission 1",
      completedOn: "2026-11-03",
      firstTry: 5,
      answerable: 7,
      hints: 1,
    });
    expect(familyRoad([child("Sam", 1, 0)]).places[0]?.latest).toBeNull();
  });

  it("keeps two children on one stop in the order they were added", () => {
    const road = familyRoad([child("Sam", 0, 1), child("Maya", 1, 1)]);
    expect(standingAt(road, 1).map((p) => p.nickname)).toEqual(["Sam", "Maya"]);
  });
});

describe("familyJars", () => {
  const rows = [
    { childId: "a", nickname: "A", slot: 0, jars: { spend: 500, save: 1200 } },
    { childId: "b", nickname: "B", slot: 1, jars: { spend: 250, save: 0 } },
    { childId: "c", nickname: "C", slot: 2, jars: null },
  ];
  it("adds everyone up, leaving out a child whose jars didn't load", () => {
    expect(familyJars(rows, null)).toEqual({ spend: 750, save: 1200, counted: 2 });
  });
  it("shows one child when picked", () => {
    expect(familyJars(rows, "b")).toEqual({ spend: 250, save: 0, counted: 1 });
  });
});

describe("goalPlace", () => {
  const who = { childId: "a", nickname: "Maya", slot: 0 };
  const view = (fillRatio: number, reached = false): GoalView => ({
    goal: {
      id: "g",
      name: "Headphones",
      emoji: "🎧",
      targetMinor: 4000,
      planMinor: null,
      reachedAt: null,
      celebratedAt: null,
    },
    progress: { countedMinor: 1800, remainingMinor: 2200, paymentsLeft: null, reached, fillRatio },
  });
  it("turns progress into a whole percent, never 100 before the goal is reached", () => {
    expect(goalPlace(who, view(0.456)).goal?.percent).toBe(45);
    expect(goalPlace(who, view(0.999)).goal?.percent).toBe(99);
    expect(goalPlace(who, view(1, true)).goal?.percent).toBe(100);
  });
  it("has no goal for a child who hasn't set one", () => {
    expect(goalPlace(who, null).goal).toBeNull();
    expect(familyBoardCopy.noGoal("Maya")).toBe("Maya hasn't set a goal yet");
  });
});
