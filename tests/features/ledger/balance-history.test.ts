import { describe, expect, it } from "vitest";
import {
  balanceHistory,
  graphCaption,
  graphPeriods,
  jarChange,
  lastDays,
  riderTrack,
} from "@/features/ledger/balance-history";

const money = (minor: number) => `£${minor / 100}`;

describe("balanceHistory", () => {
  it("walks back from today's balances, one point per day, oldest first", () => {
    const history = balanceHistory(
      { spend: 1240, save: 6400 },
      [
        { jar: "spend", direction: "in", amountMinor: 1000, occurredOn: "2026-10-30" },
        { jar: "spend", direction: "out", amountMinor: 350, occurredOn: "2026-10-30" },
        { jar: "save", direction: "in", amountMinor: 800, occurredOn: "2026-10-28" },
      ],
      "2026-10-27",
      "2026-10-31",
    );
    expect(history.points.map((p) => p.date)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    // Today and yesterday end at the jars' figures; before the 30th Spend was £6.50 lower.
    expect(history.points.at(-1)).toEqual({ date: "2026-10-31", spend: 1240, save: 6400 });
    expect(history.points[3]).toEqual({ date: "2026-10-30", spend: 1240, save: 6400 });
    expect(history.points[2]).toEqual({ date: "2026-10-29", spend: 590, save: 6400 });
    expect(history.points[0]).toEqual({ date: "2026-10-27", spend: 590, save: 5600 });
    expect(history.movedOn).toEqual(["2026-10-28", "2026-10-30"]);
  });

  it("ignores movements outside the window", () => {
    const history = balanceHistory(
      { spend: 500, save: 0 },
      [{ jar: "spend", direction: "in", amountMinor: 500, occurredOn: "2026-10-01" }],
      "2026-10-29",
      "2026-10-31",
    );
    expect(history.points.every((p) => p.spend === 500)).toBe(true);
    expect(history.movedOn).toEqual([]);
  });
});

describe("lastDays and jarChange", () => {
  const history = balanceHistory(
    { spend: 1000, save: 2000 },
    [
      { jar: "save", direction: "in", amountMinor: 500, occurredOn: "2026-10-30" },
      { jar: "spend", direction: "out", amountMinor: 200, occurredOn: "2026-10-20" },
    ],
    "2026-10-02",
    "2026-10-31",
  );

  it("keeps the newest days and the moves inside them", () => {
    const week = lastDays(history, 7);
    expect(week.points).toHaveLength(7);
    expect(week.points[0]?.date).toBe("2026-10-25");
    expect(week.movedOn).toEqual(["2026-10-30"]);
    expect(lastDays(history, 30).movedOn).toEqual(["2026-10-20", "2026-10-30"]);
  });

  it("says how far each jar moved across the period", () => {
    expect(jarChange(lastDays(history, 7).points)).toEqual({ spend: 0, save: 500 });
    expect(jarChange(lastDays(history, 30).points)).toEqual({ spend: -200, save: 500 });
    expect(jarChange([])).toEqual({ spend: 0, save: 0 });
  });
});

describe("graphPeriods and riderTrack", () => {
  it("offers the week first, in friendly words", () => {
    expect(graphPeriods.map((p) => p.label)).toEqual(["This week", "This month", "3 months"]);
    expect(graphPeriods[0].days).toBe(7);
  });

  it("gives the coach the track that moved most, Save if tied", () => {
    expect(
      riderTrack([
        { date: "2026-10-25", spend: 1000, save: 1000 },
        { date: "2026-10-31", spend: 1500, save: 1200 },
      ]),
    ).toBe("spend");
    expect(
      riderTrack([
        { date: "2026-10-25", spend: 1000, save: 1000 },
        { date: "2026-10-31", spend: 1200, save: 800 },
      ]),
    ).toBe("save");
    expect(riderTrack([])).toBe("save");
  });
});

describe("graphCaption", () => {
  it("names what climbed and what dipped in the period's words, praising only saving", () => {
    const points = [
      { date: "2026-10-25", spend: 1200, save: 1500 },
      { date: "2026-10-31", spend: 1000, save: 2000 },
    ];
    expect(graphCaption(points, true, money)).toBe(
      "Spend dipped £2 and Save climbed £5 this week. Nice.",
    );
    expect(graphCaption(points, true, money, "this month")).toBe(
      "Spend dipped £2 and Save climbed £5 this month. Nice.",
    );
    expect(
      graphCaption(
        [
          { date: "2026-10-25", spend: 1000, save: 2000 },
          { date: "2026-10-31", spend: 1300, save: 2000 },
        ],
        true,
        money,
        "these 3 months",
      ),
    ).toBe("Spend climbed £3 these 3 months.");
    expect(
      graphCaption(
        [
          { date: "2026-10-25", spend: 1000, save: 2000 },
          { date: "2026-10-31", spend: 1000, save: 2000 },
        ],
        true,
        money,
      ),
    ).toBe("Both jars stayed put this week.");
  });

  it("invites the first allowance when nothing has moved yet", () => {
    expect(graphCaption([], false, money)).toBe(
      "Nothing has moved yet. Your first allowance will show up here.",
    );
  });
});
