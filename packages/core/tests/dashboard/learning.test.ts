import type { DashboardChild } from "@jarso/core/dashboard";
import { checkSummary, homeSummaryFacts, learningSnapshot } from "@jarso/core/dashboard";
import type { LearningOverview } from "@jarso/core/learning";
import { describe, expect, it } from "vitest";

// Wednesday 4 November 2026: this week started on Monday 2 November.
const today = "2026-11-04";

const overview = (over: Partial<LearningOverview>): LearningOverview => ({
  journey: [],
  skills: [],
  checkIn: null,
  practiceDue: 0,
  daysThisWeek: 0,
  streak: 0,
  points: 0,
  longestStreak: 0,
  lastLearnedOn: null,
  nextStep: { kind: "check-in" },
  completed: [],
  ...over,
});

const mission = (title: string, completedOn: string, firstTry: number, hints: number) => ({
  attemptId: `${title}-${completedOn}`,
  missionKey: title,
  title,
  completedOn,
  firstTry,
  answerable: 7,
  hints,
});

const zarrar = overview({
  daysThisWeek: 2,
  streak: 3,
  points: 120,
  practiceDue: 2,
  checkIn: { correctCount: 3 } as LearningOverview["checkIn"],
  skills: [
    { skillKey: "split.amounts", level: 3 } as LearningOverview["skills"][number],
    { skillKey: "balance.afford", level: 2 } as LearningOverview["skills"][number],
  ],
  nextStep: { kind: "mission", missionKey: "m3", title: "Needs and wants", day: 3 },
  completed: [
    mission("What's in Spend", "2026-11-03", 5, 1),
    mission("Saving up", "2026-10-28", 6, 0),
  ],
});

const reads = (id: string, due: DashboardChild["due"], flaggedChats = 0) =>
  ({ id, due, flaggedChats }) as DashboardChild;

describe("learningSnapshot", () => {
  it("splits this week's lessons from older ones and says what's next", () => {
    const snap = learningSnapshot(zarrar, today);
    expect(snap.thisWeek.map((m) => m.title)).toEqual(["What's in Spend"]);
    expect(snap.latest?.title).toBe("What's in Spend");
    expect(snap.skillsLearned).toBe(1);
    expect(snap.skillsTotal).toBeGreaterThan(1);
    expect(snap.next).toBe("Next mission: Needs and wants");
    expect(snap.checkInDone).toBe(true);
  });

  it("has nothing to say about lessons before the first one", () => {
    const snap = learningSnapshot(overview({}), today);
    expect(snap.latest).toBeNull();
    expect(snap.thisWeek).toEqual([]);
    expect(snap.next).toBe("Starting check-in not done yet");
  });
});

describe("homeSummaryFacts", () => {
  const learning = [
    { childId: "z", nickname: "Zarrar", slot: 1, overview: zarrar },
    { childId: "a", nickname: "Ayesha", slot: 2, overview: overview({}) },
  ];
  const money = [
    reads("z", [
      {
        kind: "allowance",
        id: "o1",
        dueOn: "2026-10-30",
        amountMinor: 7500,
        note: null,
        plannedSaveMinor: null,
      },
    ]),
    reads("a", [], 1),
  ];

  it("leads with each child's learning, then only what waits on the parent", () => {
    const facts = homeSummaryFacts(learning, money, "USD", today);
    expect(facts.names).toEqual(["Zarrar", "Ayesha"]);
    expect(facts.lines).toEqual([
      "Zarrar learned on 2 days this week.",
      "Zarrar has learned 3 days in a row.",
      "Zarrar finished What's in Spend on 3 Nov: 5 of 7 right first time, with 1 hint.",
      expect.stringMatching(/^Zarrar has learned 1 of \d+ skills\.$/),
      "Zarrar has 2 practice questions waiting.",
      "Zarrar's next mission is Needs and wants.",
      "One handover for Zarrar is waiting for you: US$75.00.",
      "Ayesha hasn't done a lesson yet this week.",
      expect.stringMatching(/^Ayesha has learned 0 of \d+ skills\.$/),
      "Ayesha hasn't done the starting check-in yet.",
      "One chat Ayesha had with Jarso this week was flagged for you to read.",
    ]);
  });

  it("carries no spending or jar figures, which live on the Money page", () => {
    const text = homeSummaryFacts(learning, money, "USD", today).lines.join("\n");
    expect(text).not.toMatch(/in Spend and|in Save\.|\bspent\b|biggest spending/);
  });

  it("lets a summary through that uses the lessons' own figures", () => {
    const facts = homeSummaryFacts(learning, money, "USD", today);
    expect(
      checkSummary(
        "Zarrar finished What's in Spend on 3 Nov with 5 of 7 right first time and has learned 3 days in a row. Ayesha hasn't done a lesson yet this week.",
        facts,
      ),
    ).toBe(true);
    expect(checkSummary("Zarrar got 12 of 7 right.", facts)).toBe(false);
  });
});
