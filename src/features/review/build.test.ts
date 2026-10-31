import { describe, expect, it } from "vitest";
import type { GoalView } from "@/features/goals";
import type { AnswerableStep, SkillProgress } from "@/features/learning";
import type { HistoryItem } from "@/features/ledger";
import {
  buildWeeklyReview,
  decisionLine,
  freshQuestion,
  showsOnHome,
  understoodThisWeek,
  weekMoney,
  worthPractising,
} from "./build";

// Friday 30 October 2026: the week is Mon 26 to Sun 1 Nov.
const today = "2026-10-30";

const item = (over: Partial<HistoryItem>): HistoryItem => ({
  id: "i",
  kind: "purchase",
  amountMinor: 300,
  dueMinor: null,
  label: "Comic",
  occurredOn: "2026-10-28",
  undone: false,
  entryId: null,
  canUndo: false,
  ...over,
});

const skill = (
  skillKey: SkillProgress["skillKey"],
  level: SkillProgress["level"],
): SkillProgress => ({
  skillKey,
  level,
  firstTryCorrect: 0,
  correctWithHints: 0,
  reasonsCorrect: 0,
  reviewsPassed: 0,
});

const goal = (planMinor: number | null, countedMinor = 6400): GoalView => ({
  goal: {
    id: "g",
    name: "bike",
    emoji: "🚲",
    targetMinor: 12000,
    planMinor,
    reachedAt: null,
    celebratedAt: null,
  },
  progress: {
    countedMinor,
    remainingMinor: 12000 - countedMinor,
    paymentsLeft: planMinor ? Math.ceil((12000 - countedMinor) / planMinor) : null,
    reached: false,
    fillRatio: countedMinor / 12000,
  },
});

describe("weekMoney", () => {
  it("totals received, spent and saved for this week only, skipping undone and extra as income", () => {
    const money = weekMoney(
      [
        item({
          kind: "allowance",
          amountMinor: 1000,
          label: "Allowance",
          occurredOn: "2026-10-26",
        }),
        item({ kind: "extra", amountMinor: 150, label: "School trip" }),
        item({ amountMinor: 300 }),
        item({ amountMinor: 999, undone: true }),
        item({ kind: "deposit", amountMinor: 500 }),
        item({ kind: "withdrawal", amountMinor: 200 }),
        item({ kind: "allowance", amountMinor: 1000, occurredOn: "2026-10-19" }),
      ],
      1000,
      today,
    );
    expect(money).toEqual({
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
      receivedMinor: 1150,
      spentMinor: 300,
      savedMinor: 300,
      stillDueMinor: 1000,
    });
  });
});

describe("decisionLine", () => {
  it("names the biggest move into Save and what it did to the goal", () => {
    const line = decisionLine(
      [item({ kind: "deposit", amountMinor: 800 }), item({ amountMinor: 300 })],
      goal(400),
      "GBP",
      today,
    );
    expect(line).toEqual({
      what: "You put £8 into Save.",
      effect: "That's about 2 allowances closer to your bike.",
    });
  });

  it("states a take-out plainly, without judging it", () => {
    const line = decisionLine(
      [item({ kind: "withdrawal", amountMinor: 400 })],
      goal(400),
      "GBP",
      today,
    );
    expect(line?.what).toBe("You took £4 out of Save.");
    expect(line?.effect).toContain("about 1 allowance further off");
    expect(line?.effect).not.toMatch(/should|waste|only|just/);
  });

  it("falls back to the biggest purchase and says the goal is unchanged (FR05)", () => {
    const line = decisionLine(
      [item({ amountMinor: 300 }), item({ id: "b", amountMinor: 700, label: "Game" })],
      goal(400),
      "GBP",
      today,
    );
    expect(line).toEqual({
      what: "You bought Game for £7.",
      effect: "It came from Spend, so your bike is just where it was.",
    });
  });

  it("is null for a quiet week", () => {
    expect(decisionLine([], null, "GBP", today)).toBeNull();
  });
});

describe("skills", () => {
  const now = [skill("balance.afford", 2), skill("split.amounts", 1), skill("goal.progress", 3)];

  it("praises the highest-level skill worked on this week, never one only started", () => {
    expect(understoodThisWeek(now, ["split.amounts", "goal.progress"])?.skillKey).toBe(
      "goal.progress",
    );
    // Started (level 1) means seen, not shown: nothing to praise yet.
    expect(understoodThisWeek(now, ["split.amounts"])).toBeNull();
    expect(understoodThisWeek(now, [])).toBeNull();
  });

  it("suggests the lowest learned skill with the soonest review, not the one just praised", () => {
    const reviews = [
      { skillKey: "split.amounts" as const, box: 1, dueOn: "2026-11-02" },
      { skillKey: "balance.afford" as const, box: 3, dueOn: "2026-10-31" },
    ];
    expect(worthPractising(now, reviews, "goal.progress")?.skillKey).toBe("split.amounts");
    expect(worthPractising([skill("balance.afford", 0)], [], null)).toBeNull();
  });

  it("asks a fresh question on a learned skill the child hasn't just answered", () => {
    const q = (key: string, skillKey: AnswerableStep["skill"]): AnswerableStep =>
      ({ type: "choice", key, skill: skillKey }) as unknown as AnswerableStep;
    const pool = [q("a", "split.amounts"), q("b", "split.amounts"), q("c", "plan.adjust")];
    expect(freshQuestion(pool, now, "split.amounts", ["a"])?.key).toBe("b");
    // Every item just seen: better a repeat than no question at all.
    expect(freshQuestion(pool, now, null, ["a", "b"])?.key).toBe("a");
    // Nothing learned yet: no question.
    expect(freshQuestion(pool, [], null, [])).toBeNull();
  });
});

describe("buildWeeklyReview and showsOnHome", () => {
  it("assembles every line", () => {
    const review = buildWeeklyReview({
      today,
      currency: "GBP",
      history: [item({ kind: "deposit", amountMinor: 500 })],
      stillDueMinor: 0,
      goal: goal(500),
      skills: [skill("goal.progress", 2)],
      workedOnThisWeek: ["goal.progress"],
      reviews: [],
      pool: [],
      recentItemKeys: [],
    });
    expect(review.money.savedMinor).toBe(500);
    expect(review.goal.kind).toBe("progress");
    expect(review.decision?.what).toBe("You put £5 into Save.");
    expect(review.understood?.skillKey).toBe("goal.progress");
    expect(review.practise).toBeNull();
    expect(review.question).toBeNull();
  });

  it("shows on Home from Friday to Monday only", () => {
    expect(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"].map(showsOnHome)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(["2026-10-27", "2026-10-28", "2026-10-29"].map(showsOnHome)).toEqual([
      false,
      false,
      false,
    ]);
  });
});
