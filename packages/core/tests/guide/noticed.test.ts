import type { NoticedInput, NoticedSignal } from "@jarso/core/guide";
import {
  ALLOWANCES_READ,
  goalQuarterSignal,
  noticedLines,
  pickSignal,
  quietSignal,
  savingStreakSignal,
  spendingJumpSignal,
} from "@jarso/core/guide";
import { describe, expect, it } from "vitest";

/** A Thursday, with nothing to say unless a test adds it. */
const quiet: NoticedInput = {
  today: "2026-11-05",
  allowances: [],
  goal: null,
  spentLast7DaysMinor: 0,
  spent7DaysBeforeMinor: 0,
  lastMoveOn: "2026-11-04",
  sentKeys: [],
};

/** Weekly allowances, newest first, `saved` for the first `streak` of them. */
function allowances(count: number, streak: number) {
  return Array.from({ length: count }, (_, i) => ({
    on: `2026-${String(10 - Math.floor(i / 4)).padStart(2, "0")}-${String(28 - (i % 4) * 7).padStart(2, "0")}`,
    saved: i < streak,
  }));
}

const goal = { id: "g1", name: "Bike", targetMinor: 10000, countedMinor: 0 };

describe("goalQuarterSignal", () => {
  it("says nothing below a quarter", () => {
    expect(goalQuarterSignal({ ...quiet, goal: { ...goal, countedMinor: 2499 } })).toBeNull();
  });

  it("tells each quarter mark, up to the whole goal", () => {
    expect(goalQuarterSignal({ ...quiet, goal: { ...goal, countedMinor: 2500 } })).toMatchObject({
      kind: "goal_quarter",
      key: "goal_quarter:g1:1",
      quarter: 1,
    });
    expect(goalQuarterSignal({ ...quiet, goal: { ...goal, countedMinor: 7600 } })?.key).toBe(
      "goal_quarter:g1:3",
    );
    expect(goalQuarterSignal({ ...quiet, goal: { ...goal, countedMinor: 25000 } })?.key).toBe(
      "goal_quarter:g1:4",
    );
  });

  it("never tells a mark twice, nor a lower one after a higher", () => {
    const half = { ...quiet, goal: { ...goal, countedMinor: 5000 } };
    expect(goalQuarterSignal({ ...half, sentKeys: ["goal_quarter:g1:2"] })).toBeNull();
    // Save dropped back under half after "halfway" was told: still nothing new.
    const quarter = { ...quiet, goal: { ...goal, countedMinor: 3000 } };
    expect(goalQuarterSignal({ ...quarter, sentKeys: ["goal_quarter:g1:2"] })).toBeNull();
    // A new goal starts over.
    expect(goalQuarterSignal({ ...half, sentKeys: ["goal_quarter:g0:4"] })?.key).toBe(
      "goal_quarter:g1:2",
    );
  });
});

describe("savingStreakSignal", () => {
  it("needs three allowances in a row with something saved", () => {
    expect(savingStreakSignal({ ...quiet, allowances: allowances(5, 2) })).toBeNull();
    expect(savingStreakSignal({ ...quiet, allowances: allowances(5, 3) })).toMatchObject({
      kind: "saving_streak",
      count: 3,
    });
  });

  it("counts from the newest allowance only", () => {
    const broken = allowances(6, 6).map((a, i) => (i === 0 ? { ...a, saved: false } : a));
    expect(savingStreakSignal({ ...quiet, allowances: broken })).toBeNull();
  });

  it("keeps a milestone's key as new allowances arrive, so it is told once", () => {
    const first = savingStreakSignal({ ...quiet, allowances: allowances(6, 3) });
    // A week later the streak is 4: the next allowance arrives at the front.
    const next = [{ on: "2026-11-04", saved: true }, ...allowances(6, 3)];
    expect(savingStreakSignal({ ...quiet, allowances: next, sentKeys: [] })?.key).toBe(first?.key);
    expect(
      savingStreakSignal({ ...quiet, allowances: next, sentKeys: [first?.key ?? ""] }),
    ).toBeNull();
  });

  it("tells the biggest milestone passed, with the real count", () => {
    expect(savingStreakSignal({ ...quiet, allowances: allowances(9, 7) })).toMatchObject({
      count: 7,
      key: expect.stringMatching(/^saving_streak:5:/),
    });
  });

  it("leaves a streak longer than the inputs reach alone", () => {
    expect(
      savingStreakSignal({ ...quiet, allowances: allowances(ALLOWANCES_READ, ALLOWANCES_READ) }),
    ).toBeNull();
  });
});

describe("spendingJumpSignal", () => {
  it("fires when the last 7 days come to more than twice the 7 before", () => {
    const input = { ...quiet, spentLast7DaysMinor: 2001, spent7DaysBeforeMinor: 1000 };
    expect(spendingJumpSignal(input)).toEqual({
      kind: "spending_jump",
      key: "spending_jump:2026-11-02",
      thisWeekMinor: 2001,
      weekBeforeMinor: 1000,
    });
    expect(spendingJumpSignal({ ...input, sentKeys: ["spending_jump:2026-11-02"] })).toBeNull();
  });

  it("stays quiet at exactly twice, and after a week with nothing spent", () => {
    expect(
      spendingJumpSignal({ ...quiet, spentLast7DaysMinor: 2000, spent7DaysBeforeMinor: 1000 }),
    ).toBeNull();
    expect(
      spendingJumpSignal({ ...quiet, spentLast7DaysMinor: 5000, spent7DaysBeforeMinor: 0 }),
    ).toBeNull();
  });
});

describe("quietSignal", () => {
  it("fires after 14 days with nothing moving, once per quiet spell", () => {
    expect(quietSignal({ ...quiet, lastMoveOn: "2026-10-23" })).toBeNull();
    expect(quietSignal({ ...quiet, lastMoveOn: "2026-10-22" })).toEqual({
      kind: "quiet",
      key: "quiet:2026-10-22",
      days: 14,
    });
    expect(
      quietSignal({ ...quiet, lastMoveOn: "2026-10-22", sentKeys: ["quiet:2026-10-22"] }),
    ).toBeNull();
  });

  it("says nothing for a child whose money never moved", () => {
    expect(quietSignal({ ...quiet, lastMoveOn: null })).toBeNull();
  });
});

describe("pickSignal", () => {
  it("picks one a week: goal, then streak, then spending, then quiet", () => {
    const everything: NoticedInput = {
      ...quiet,
      goal: { ...goal, countedMinor: 5000 },
      allowances: allowances(5, 3),
      spentLast7DaysMinor: 3000,
      spent7DaysBeforeMinor: 1000,
      lastMoveOn: "2026-10-01",
    };
    expect(pickSignal(everything)?.kind).toBe("goal_quarter");
    expect(pickSignal({ ...everything, goal: null })?.kind).toBe("saving_streak");
    expect(pickSignal({ ...everything, goal: null, allowances: [] })?.kind).toBe("spending_jump");
    expect(
      pickSignal({ ...everything, goal: null, allowances: [], spent7DaysBeforeMinor: 0 })?.kind,
    ).toBe("quiet");
    expect(pickSignal(quiet)).toBeNull();
  });
});

describe("noticedLines", () => {
  const signals: NoticedSignal[] = [
    {
      kind: "goal_quarter",
      key: "k",
      quarter: 2,
      goalName: "Bike",
      countedMinor: 5000,
      targetMinor: 10000,
    },
    {
      kind: "goal_quarter",
      key: "k",
      quarter: 4,
      goalName: "Bike",
      countedMinor: 10500,
      targetMinor: 10000,
    },
    { kind: "saving_streak", key: "k", count: 5 },
    { kind: "spending_jump", key: "k", thisWeekMinor: 3000, weekBeforeMinor: 1000 },
    { kind: "quiet", key: "k", days: 15 },
  ];
  const options = { nickname: "Sam", currency: "GBP", guideOn: true };

  it("uses only refs it has a figure for", () => {
    for (const signal of signals) {
      for (const guideOn of [true, false]) {
        const lines = noticedLines(signal, { ...options, guideOn });
        const keys = new Set(lines.facts.map(([key]) => key));
        for (const line of [lines.child, lines.parent]) {
          if (!line) continue;
          const refs = [...`${line.title} ${line.detail}`.matchAll(/\{\{([^}]+)\}\}/g)].map(
            (m) => m[1],
          );
          for (const ref of refs) expect(keys.has(ref ?? "")).toBe(true);
          expect(line.title).not.toMatch(/\{\{/);
        }
      }
    }
  });

  it("keeps child copy calm: no exclamation marks, nothing about how much is a lot", () => {
    for (const signal of signals) {
      const { child, parent } = noticedLines(signal, options);
      for (const line of [child, parent]) {
        if (!line) continue;
        expect(`${line.title} ${line.detail}`).not.toMatch(/!|a lot|not much|too much|only /i);
      }
    }
  });

  it("formats figures in the family's currency", () => {
    const { facts, child, parent } = noticedLines(signals[0] as NoticedSignal, options);
    expect(Object.fromEntries(facts)).toEqual({ "goal.saved": "£50", "goal.price": "£100" });
    expect(child?.title).toBe("Halfway to Bike");
    expect(parent.title).toBe("Sam is halfway to Bike");
    expect(child?.open).toBe("goal");
  });

  it("tells spending to the parent only, opening the history", () => {
    const lines = noticedLines(signals[3] as NoticedSignal, options);
    expect(lines.child).toBeNull();
    expect(lines.parent.detail).toContain("Worth a chat");
    expect(lines.parent.open).toBe("history");
  });

  it("only points a child at Jarso when Jarso is on", () => {
    const on = noticedLines(signals[4] as NoticedSignal, options);
    const off = noticedLines(signals[4] as NoticedSignal, { ...options, guideOn: false });
    expect(on.child?.open).toBe("jarso");
    expect(off.child?.open).toBe("home");
    expect(`${off.child?.title} ${off.child?.detail}`).not.toContain("Jarso");
  });
});
