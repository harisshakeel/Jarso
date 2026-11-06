import type { BalanceHistory, WeekTotal } from "@jarso/core/ledger";
import { isBestWeek, jarPageCopy, jarPageFill, weekLine, weeklyTotals } from "@jarso/core/ledger";
import { describe, expect, it } from "vitest";

const TODAY = "2026-11-06";

function history(points: Array<[string, number, number]>): BalanceHistory {
  return {
    points: points.map(([date, spend, save]) => ({ date, spend, save })),
    movedOn: [],
  };
}

/** A flat run of days from `from` to `to` with every day holding the given balances. */
function days(
  from: string,
  to: string,
  at: (date: string) => { spend: number; save: number },
): BalanceHistory {
  const points: BalanceHistory["points"] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); ) {
    const date = d.toISOString().slice(0, 10);
    points.push({ date, ...at(date) });
    d = new Date(d.getTime() + 86_400_000);
  }
  return { points, movedOn: [] };
}

describe("weeklyTotals", () => {
  it("returns six weeks oldest first ending with the current week", () => {
    const totals = weeklyTotals(history([[TODAY, 0, 0]]), "save", TODAY);
    expect(totals.map((t) => t.weekStart)).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
    ]);
    expect(totals.map((t) => t.current)).toEqual([false, false, false, false, false, true]);
  });

  it("a week's total is its closing balance minus the Sunday before", () => {
    const h = days("2026-09-20", TODAY, (date) => ({
      spend: 0,
      save: date >= "2026-11-01" ? 3000 : date >= "2026-10-25" ? 1000 : 0,
    }));
    const totals = weeklyTotals(h, "save", TODAY);
    expect(totals.find((t) => t.weekStart === "2026-10-26")?.amountMinor).toBe(2000);
    expect(totals.find((t) => t.weekStart === "2026-10-19")?.amountMinor).toBe(1000);
  });

  it("the current week runs to today only", () => {
    const h = days("2026-10-25", TODAY, (date) => ({
      spend: 0,
      save: date >= "2026-11-04" ? 700 : 0,
    }));
    expect(weeklyTotals(h, "save", TODAY).at(-1)?.amountMinor).toBe(700);
  });

  it("a week where savings went down is negative", () => {
    const h = days("2026-10-25", TODAY, (date) => ({
      spend: 0,
      save: date >= "2026-11-02" ? 2000 : 5000,
    }));
    expect(weeklyTotals(h, "save", TODAY).at(-1)?.amountMinor).toBe(-3000);
  });

  it("weeks before the history starts count as zero", () => {
    const h = days("2026-10-20", TODAY, () => ({ spend: 400, save: 900 }));
    const totals = weeklyTotals(h, "save", TODAY);
    expect(totals.slice(0, 3).map((t) => t.amountMinor)).toEqual([0, 0, 0]);
    expect(totals.every((t) => Number.isFinite(t.amountMinor))).toBe(true);
  });

  it("an empty history gives six zero weeks", () => {
    const totals = weeklyTotals({ points: [], movedOn: [] }, "save", TODAY);
    expect(totals).toHaveLength(6);
    expect(totals.map((t) => t.amountMinor)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("a Monday belongs to the new week", () => {
    const h = history([
      ["2026-11-01", 0, 0],
      ["2026-11-02", 0, 500],
      ["2026-11-03", 0, 500],
    ]);
    const totals = weeklyTotals(h, "save", "2026-11-03");
    expect(totals.at(-1)?.amountMinor).toBe(500);
    expect(totals.at(-2)?.amountMinor).toBe(0);
  });

  it("labels show the month on the first bar and when it changes", () => {
    const h = history([[TODAY, 0, 0]]);
    expect(weeklyTotals(h, "save", TODAY).map((t) => t.label)).toEqual([
      "Sep 28",
      "Oct 5",
      "12",
      "19",
      "26",
      "This week",
    ]);
    const later = weeklyTotals(h, "save", "2026-11-13").map((t) => t.label);
    expect(later).toEqual(["Oct 5", "12", "19", "26", "Nov 2", "This week"]);
  });

  it("a history that ends before today holds its last balance", () => {
    const h = days("2026-10-20", "2026-11-03", (date) => ({
      spend: 0,
      save: date >= "2026-11-02" ? 800 : 100,
    }));
    const totals = weeklyTotals(h, "save", TODAY);
    expect(totals.at(-1)?.amountMinor).toBe(700);
  });

  it("spend and save are bucketed separately", () => {
    const h = days("2026-10-25", TODAY, (date) => ({
      spend: date >= "2026-11-02" ? 100 : 400,
      save: date >= "2026-11-02" ? 900 : 200,
    }));
    expect(weeklyTotals(h, "spend", TODAY).at(-1)?.amountMinor).toBe(-300);
    expect(weeklyTotals(h, "save", TODAY).at(-1)?.amountMinor).toBe(700);
  });
});

const pounds = (minor: number) => `£${minor / 100}`;

function weeksOf(...amounts: number[]): WeekTotal[] {
  return amounts.map((amountMinor, i) => ({
    weekStart: `2026-10-${String(5 + i * 7).padStart(2, "0")}`,
    label: String(i),
    amountMinor,
    current: i === amounts.length - 1,
  }));
}

describe("weekLine", () => {
  it("says how much more than last week", () => {
    expect(weekLine(weeksOf(0, 0, 0, 0, 2000, 7000), "save", pounds)).toBe(
      "£50 more than last week!",
    );
  });

  it("is calm when savings went down", () => {
    const line = weekLine(weeksOf(0, 0, 0, 0, 1000, -500), "save", pounds);
    expect(line).toBe("You used some savings.");
    expect(line).not.toContain("less");
  });

  it("two weeks of using savings is not steady", () => {
    expect(weekLine(weeksOf(0, 0, 0, 0, -500, -500), "save", pounds)).toBe(
      "You used some savings.",
    );
  });

  it("compares with zero when last week was negative", () => {
    expect(weekLine(weeksOf(0, 0, 0, 0, -500, 2000), "save", pounds)).toBe(
      "£20 more than last week!",
    );
  });

  it("for a quiet week after a big one keeps going", () => {
    expect(weekLine(weeksOf(0, 0, 0, 0, 5000, 0), "save", pounds)).toBe(
      "Every coin counts. Keep going!",
    );
  });

  it("says the first time for both jars", () => {
    expect(weekLine(weeksOf(0, 0, 0, 0, 0, 0), "save", pounds)).toBe("Your first save shows here.");
    expect(weekLine(weeksOf(0, 0, 0, 0, 0, 0), "spend", pounds)).toBe("Nothing moved yet.");
  });

  it("does not cheer a save week that only climbed back to zero", () => {
    expect(weekLine(weeksOf(0, 0, 0, 0, -500, 0), "save", pounds)).toBe(
      "Every coin counts. Keep going!",
    );
  });

  it("describes spend for this week only, with no comparison", () => {
    expect(weekLine(weeksOf(0, 0, 0, 0, -1000, -3000), "spend", pounds)).toBe(
      "£30 went out of Spend this week.",
    );
    expect(weekLine(weeksOf(0, 0, 0, 0, -3000, 2000), "spend", pounds)).toBe(
      "Spend grew £20 this week.",
    );
    expect(weekLine(weeksOf(0, 0, 0, 0, -3000, 0), "spend", pounds)).toBe(
      "Spend stayed the same this week.",
    );
  });

  const cases: Array<[string, WeekTotal[]]> = [
    ["more", weeksOf(0, 0, 0, 0, 2000, 7000)],
    ["same", weeksOf(0, 0, 0, 0, 2000, 2000)],
    ["down", weeksOf(0, 0, 0, 0, 1000, -500)],
    ["quiet", weeksOf(0, 0, 0, 0, 5000, 0)],
    ["less", weeksOf(0, 0, 0, 0, 5000, 100)],
    ["none", weeksOf(0, 0, 0, 0, 0, 0)],
  ];

  it("for spend never cheers", () => {
    for (const [, totals] of cases) expect(weekLine(totals, "spend", pounds)).not.toContain("!");
  });

  it("every week line is at most 8 words", () => {
    for (const jar of ["save", "spend"] as const) {
      for (const [, totals] of cases) {
        const words = weekLine(totals, jar, (m) => `₹${m / 100}`).split(/\s+/);
        expect(words.length).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("isBestWeek", () => {
  it("needs a positive week above every earlier one", () => {
    expect(isBestWeek(weeksOf(100, 200, 0, 50, 300, 400))).toBe(true);
    expect(isBestWeek(weeksOf(100, 400, 0, 50, 300, 400))).toBe(false);
    expect(isBestWeek(weeksOf(100, 200, 0, 50, 300, -400))).toBe(false);
    expect(isBestWeek(weeksOf(0, 0, 0, 0, 0, 0))).toBe(false);
  });
});

describe("jarPageFill", () => {
  it("save matches jarsoFill and spend is its share", () => {
    const input = { spendMinor: 300, saveMinor: 100, goalTargetMinor: null };
    expect(jarPageFill("save", input)).toBe(0.25);
    expect(jarPageFill("spend", input)).toBe(0.75);
    expect(jarPageFill("save", { ...input, goalTargetMinor: 50 })).toBe(1);
    expect(jarPageFill("save", { spendMinor: -5, saveMinor: -5, goalTargetMinor: 100 })).toBe(0);
    expect(jarPageFill("spend", { spendMinor: -5, saveMinor: 100, goalTargetMinor: null })).toBe(0);
  });
});

describe("jarPageCopy", () => {
  it("jar actions link to the existing money routes", () => {
    expect(jarPageCopy.actions.spend.map((a) => [a.label, a.href])).toEqual([
      ["I bought something", "/(child)/purchase"],
      ["I got money", "/(child)/received"],
    ]);
    expect(jarPageCopy.actions.spend.map((a) => a.hint)).toEqual([
      "From Spend",
      "Gift, pay, found",
    ]);
    expect(jarPageCopy.actions.save("Mum").map((a) => a.hint)).toEqual([
      "Give cash to Mum",
      "Ask Mum for it",
    ]);
    expect(jarPageCopy.actions.save("Mum").map((a) => [a.label, a.href])).toEqual([
      ["Save some", "/(child)/put-in"],
      ["Use savings", "/(child)/take-out"],
    ]);
    expect(jarPageCopy.caption.save("mum")).toBe("Mum keeps it safe");
  });
});
