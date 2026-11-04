import type { HistoryItem } from "@jarso/core/ledger";
import { bigMoments, MOMENT_LIMIT } from "@jarso/core/notifications";
import { describe, expect, it } from "vitest";

const today = "2026-11-04";
let n = 0;
const item = (over: Partial<HistoryItem>): HistoryItem => ({
  id: `h${n++}`,
  kind: "allowance",
  amountMinor: 500,
  dueMinor: null,
  label: "",
  occurredOn: "2026-11-02",
  undone: false,
  entryId: null,
  canUndo: false,
  paidByCard: false,
  category: null,
  jar: null,
  canFix: false,
  fixedFrom: null,
  ...over,
});

const learning = {
  completed: [
    {
      attemptId: "a1",
      missionKey: "m1",
      title: "What's in Spend?",
      completedOn: "2026-11-03",
      firstTry: 5,
      answerable: 6,
      hints: 0,
    },
  ],
  streak: 3,
  longestStreak: 3,
  lastLearnedOn: "2026-11-04",
};

describe("bigMoments", () => {
  it("lists missions, money in and a longest run, newest first, in words not scores", () => {
    const moments = bigMoments({
      history: [
        item({}),
        item({ kind: "gift", label: "Birthday", amountMinor: 2000, occurredOn: "2026-11-01" }),
        item({ kind: "purchase", amountMinor: 300 }),
      ],
      learning,
      goal: null,
      today,
      currency: "USD",
    });
    expect(moments.map((m) => m.kind)).toEqual(["best", "mission", "allowance", "gift"]);
    expect(moments[1]?.detail).toBe("Most of it first time. Good thinking.");
    expect(moments[3]?.title).toBe("A gift: Birthday");
    expect(moments.map((m) => m.detail).join(" ")).not.toMatch(/of 6/);
  });

  it("leads with a goal reached, leaves out undone and old lines, and stops at the limit", () => {
    const moments = bigMoments({
      history: [
        item({ undone: true }),
        item({ occurredOn: "2026-09-01" }),
        ...Array.from({ length: 12 }, () => item({})),
      ],
      learning: null,
      goal: {
        goal: {
          id: "g",
          name: "Headphones",
          emoji: "🎧",
          targetMinor: 4000,
          planMinor: null,
          reachedAt: "2026-11-03T10:00:00Z",
          celebratedAt: null,
        },
        progress: {
          countedMinor: 4000,
          remainingMinor: 0,
          paymentsLeft: null,
          reached: true,
          fillRatio: 1,
        },
      },
      today,
      currency: "USD",
    });
    expect(moments[0]?.title).toBe("You reached your goal: 🎧 Headphones");
    expect(moments).toHaveLength(MOMENT_LIMIT);
  });

  it("gives no run moment below three days or when it isn't the longest", () => {
    const moments = bigMoments({
      history: [],
      learning: { ...learning, streak: 3, longestStreak: 5 },
      goal: null,
      today,
      currency: "USD",
    });
    expect(moments.map((m) => m.kind)).toEqual(["mission"]);
  });
});
