import type { BalanceHistory } from "@jarso/core/ledger";
import { weeklyTotals } from "@jarso/core/ledger";
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

  it("spend and save are bucketed separately", () => {
    const h = days("2026-10-25", TODAY, (date) => ({
      spend: date >= "2026-11-02" ? 100 : 400,
      save: date >= "2026-11-02" ? 900 : 200,
    }));
    expect(weeklyTotals(h, "spend", TODAY).at(-1)?.amountMinor).toBe(-300);
    expect(weeklyTotals(h, "save", TODAY).at(-1)?.amountMinor).toBe(700);
  });
});
