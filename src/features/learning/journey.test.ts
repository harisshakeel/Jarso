import { describe, expect, it } from "vitest";
import {
  attemptSummary,
  buildJourney,
  canOpenMission,
  chooseNextStep,
  daysLearnedThisWeek,
  pickPracticeItems,
  resumePosition,
  summaryLine,
  weeklyRhythmLine,
} from "./journey";
import type { AnswerableStep, Mission, StepResult } from "./types";

const hints: [string, string] = ["h1", "h2"];
const choiceStep = (
  key: string,
  skill: AnswerableStep["skill"] = "balance.afford",
): AnswerableStep => ({
  type: "choice",
  key,
  skill,
  prompt: "Pick one",
  options: [
    { id: "a", text: "A", feedback: "yes" },
    { id: "b", text: "B", feedback: "no" },
  ],
  answer: "a",
  hints,
  correct: "Nice.",
});

const mission = (key: string, day: number): Mission => ({
  key,
  version: 1,
  day,
  title: `Mission ${day}`,
  topic: "spending",
  summary: "A mission",
  steps: [
    { type: "info", key: "intro", body: "Read this." },
    choiceStep("one"),
    choiceStep("two"),
    { type: "info", key: "middle", body: "And this." },
    choiceStep("three"),
    choiceStep("four"),
  ],
});

const missions = [mission("m1", 1), mission("m2", 2), mission("m3", 3)];
const result = (
  stepKey: string,
  correct = true,
  tries = 1,
  phase: "main" | "replay" = "main",
): StepResult => ({
  stepKey,
  phase,
  correct,
  hintsUsed: correct && tries === 1 ? 0 : 1,
  tries,
});

describe("buildJourney", () => {
  it("marks done, current and locked missions", () => {
    const journey = buildJourney(
      missions,
      [
        { missionKey: "m1", status: "completed", completedAt: "2026-10-29T18:00:00Z" },
        { missionKey: "m2", status: "started", completedAt: null },
      ],
      "Europe/London",
    );
    expect(journey.map((m) => m.status)).toEqual(["done", "current", "locked"]);
    expect(journey[0]?.completedOn).toBe("2026-10-29");
    expect(journey[1]?.inProgress).toBe(true);
    expect(canOpenMission(journey, "m1")).toBe(true);
    expect(canOpenMission(journey, "m2")).toBe(true);
    expect(canOpenMission(journey, "m3")).toBe(false);
    expect(canOpenMission(journey, "nope")).toBe(false);
  });

  it("ignores abandoned attempts", () => {
    const journey = buildJourney(
      missions,
      [{ missionKey: "m1", status: "abandoned", completedAt: null }],
      "UTC",
    );
    expect(journey[0]?.status).toBe("current");
    expect(journey[0]?.inProgress).toBe(false);
  });
});

describe("chooseNextStep", () => {
  const fresh = buildJourney(missions, [], "UTC");
  it("asks for the check-in before the first mission", () => {
    expect(chooseNextStep(fresh, false, 0)).toEqual({ kind: "check-in" });
    expect(chooseNextStep(fresh, true, 0)).toMatchObject({ kind: "mission", missionKey: "m1" });
  });

  it("puts an unfinished mission first, then due practice", () => {
    const journey = buildJourney(
      missions,
      [
        { missionKey: "m1", status: "completed", completedAt: "2026-10-29T18:00:00Z" },
        { missionKey: "m2", status: "started", completedAt: null },
      ],
      "UTC",
    );
    expect(chooseNextStep(journey, true, 2)).toMatchObject({ kind: "resume", missionKey: "m2" });
    const notStarted = buildJourney(
      missions,
      [{ missionKey: "m1", status: "completed", completedAt: "2026-10-29T18:00:00Z" }],
      "UTC",
    );
    expect(chooseNextStep(notStarted, true, 2)).toEqual({ kind: "practice", count: 2 });
    expect(chooseNextStep(notStarted, true, 0)).toMatchObject({
      kind: "mission",
      missionKey: "m2",
    });
  });

  it("is done when every mission is done and nothing is due", () => {
    const all = buildJourney(
      missions,
      missions.map((m) => ({
        missionKey: m.key,
        status: "completed" as const,
        completedAt: "2026-10-29T18:00:00Z",
      })),
      "UTC",
    );
    expect(chooseNextStep(all, true, 0)).toEqual({ kind: "done" });
  });
});

describe("resumePosition", () => {
  const m = missions[0] as Mission;
  it("starts at the beginning", () => {
    expect(resumePosition(m, [])).toEqual({ phase: "main", index: 0 });
  });

  it("picks up after the last answered step, including an info step", () => {
    expect(resumePosition(m, [result("one"), result("two")])).toEqual({ phase: "main", index: 3 });
  });

  it("moves to replays once every step is answered, then finishes", () => {
    const answered = [
      result("one"),
      result("two", false, 2),
      result("three", true, 2),
      result("four"),
    ];
    expect(resumePosition(m, answered)).toEqual({ phase: "replay", queue: ["two", "three"] });
    expect(resumePosition(m, [...answered, result("two", true, 1, "replay")])).toEqual({
      phase: "replay",
      queue: ["three"],
    });
    expect(
      resumePosition(m, [
        ...answered,
        result("two", true, 1, "replay"),
        result("three", false, 2, "replay"),
      ]),
    ).toEqual({ phase: "finished" });
  });
});

describe("attempt summary", () => {
  it("counts first tries and hints", () => {
    const summary = attemptSummary([
      result("one"),
      result("two", false, 2),
      result("three", true, 2),
      result("two", true, 1, "replay"),
    ]);
    expect(summary).toEqual({ answerable: 3, firstTry: 1, hints: 2 });
    expect(summaryLine(summary)).toBe("1 of 3 first try. 2 hints.");
    expect(summaryLine({ answerable: 4, firstTry: 4, hints: 0 })).toBe(
      "4 of 4 first try. No hints.",
    );
  });
});

describe("pickPracticeItems", () => {
  const pool = [
    choiceStep("afford-r1"),
    choiceStep("afford-r2"),
    choiceStep("split-r1", "split.amounts"),
  ];
  it("takes one item per due skill, least recently seen first, never one answered today", () => {
    const picked = pickPracticeItems(
      ["balance.afford", "split.amounts"],
      pool,
      [{ itemKey: "afford-r1", answeredOn: "2026-10-20" }],
      "2026-10-30",
    );
    expect(picked.map((p) => p.key)).toEqual(["afford-r2", "split-r1"]);
    const todayDone = pickPracticeItems(
      ["split.amounts"],
      pool,
      [{ itemKey: "split-r1", answeredOn: "2026-10-30" }],
      "2026-10-30",
    );
    expect(todayDone).toEqual([]);
  });

  it("stops at the set size", () => {
    expect(
      pickPracticeItems(["balance.afford", "split.amounts"], pool, [], "2026-10-30", 1),
    ).toHaveLength(1);
  });
});

describe("daysLearnedThisWeek", () => {
  it("counts distinct local days from Monday", () => {
    const days = daysLearnedThisWeek(
      [
        "2026-10-25T10:00:00Z",
        "2026-10-26T10:00:00Z",
        "2026-10-26T18:00:00Z",
        "2026-10-30T23:30:00Z",
      ],
      "Asia/Tokyo",
      "2026-10-31",
    );
    // In Tokyo: 25 Oct is the previous week; the 26 Oct 18:00 UTC entry is 27 Oct; 30 Oct
    // 23:30 UTC is 31 Oct. So 26, 27 and 31 Oct.
    expect(days).toBe(3);
    expect(weeklyRhythmLine(2)).toBe("You learned on 2 days this week.");
    expect(weeklyRhythmLine(0)).toMatch(/A new week/);
  });
});
