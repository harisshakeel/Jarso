import {
  bestMission,
  learningStreak,
  longestStreak,
  POINTS,
  pointsFor,
  pointsLine,
  streakLine,
  totalPoints,
} from "@jarso/core/learning";
import { describe, expect, it } from "vitest";

describe("points", () => {
  it("reward a first try with no hints most, help less, and trying at all a little", () => {
    expect(pointsFor({ correct: true, tries: 1, hintsUsed: 0 })).toBe(POINTS.firstTry);
    expect(pointsFor({ correct: true, tries: 1, hintsUsed: 1 })).toBe(POINTS.withHelp);
    expect(pointsFor({ correct: true, tries: 2, hintsUsed: 0 })).toBe(POINTS.withHelp);
    expect(pointsFor({ correct: false, tries: 2, hintsUsed: 2 })).toBe(POINTS.tried);
  });

  it("add up over every answer", () => {
    expect(
      totalPoints([
        { correct: true, tries: 1, hintsUsed: 0 },
        { correct: true, tries: 2, hintsUsed: 1 },
        { correct: false, tries: 2, hintsUsed: 0 },
      ]),
    ).toBe(18);
    expect(totalPoints([])).toBe(0);
    expect(pointsLine(1)).toBe("1 point");
    expect(pointsLine(18)).toBe("18 points");
  });
});

describe("learningStreak", () => {
  const tz = "Europe/London";
  const today = "2026-11-04";

  it("counts days in a row ending today", () => {
    const stamps = ["2026-11-04T08:00:00Z", "2026-11-03T18:00:00Z", "2026-11-02T09:00:00Z"];
    expect(learningStreak(stamps, tz, today)).toBe(3);
  });

  it("keeps yesterday's run alive until today is over", () => {
    const stamps = ["2026-11-03T18:00:00Z", "2026-11-02T09:00:00Z"];
    expect(learningStreak(stamps, tz, today)).toBe(2);
  });

  it("is zero after a gap, before any learning, and counts a day once", () => {
    expect(learningStreak(["2026-11-01T09:00:00Z"], tz, today)).toBe(0);
    expect(learningStreak([], tz, today)).toBe(0);
    expect(learningStreak(["2026-11-04T08:00:00Z", "2026-11-04T20:00:00Z"], tz, today)).toBe(1);
  });

  it("stops at a missing day in the middle", () => {
    const stamps = ["2026-11-04T08:00:00Z", "2026-11-03T08:00:00Z", "2026-11-01T08:00:00Z"];
    expect(learningStreak(stamps, tz, today)).toBe(2);
  });

  it("uses the family's day, not UTC", () => {
    // 23:30 UTC on the 3rd is already the 4th in Karachi.
    expect(learningStreak(["2026-11-03T23:30:00Z"], "Asia/Karachi", today)).toBe(1);
  });

  it("never says a run was lost", () => {
    expect(streakLine(0)).toBe("Learn today to start a run.");
    expect(streakLine(1)).toBe("1 day in a row. Come back tomorrow to make it 2.");
    expect(streakLine(5)).toBe("5 days in a row.");
  });
});

describe("personal bests", () => {
  const tz = "Europe/London";

  it("finds the longest run ever, not only the current one", () => {
    const stamps = [
      "2026-10-01T09:00:00Z",
      "2026-10-02T09:00:00Z",
      "2026-10-03T09:00:00Z",
      "2026-10-03T20:00:00Z",
      "2026-10-10T09:00:00Z",
      "2026-10-11T09:00:00Z",
    ];
    expect(longestStreak(stamps, tz)).toBe(3);
    expect(longestStreak([], tz)).toBe(0);
    expect(longestStreak(["2026-10-10T09:00:00Z"], tz)).toBe(1);
  });

  it("picks the mission with the most first-try answers, fewer hints breaking a tie", () => {
    const missions = [
      { title: "Newest", firstTry: 5, answerable: 7, hints: 1 },
      { title: "Clean", firstTry: 5, answerable: 7, hints: 0 },
      { title: "Best", firstTry: 6, answerable: 7, hints: 2 },
      { title: "Empty", firstTry: 0, answerable: 0, hints: 0 },
    ];
    expect(bestMission(missions)?.title).toBe("Best");
    expect(bestMission(missions.slice(0, 2))?.title).toBe("Clean");
    expect(bestMission([missions[3] as (typeof missions)[number]])).toBeNull();
    expect(bestMission([])).toBeNull();
  });
});
