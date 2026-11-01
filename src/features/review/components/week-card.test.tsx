import { describe, expect, it } from "vitest";
import { weekSentence } from "./week-card";

const money = (minor: number) => `£${(minor / 100).toFixed(minor % 100 ? 2 : 0)}`;
const week = (over: Partial<Parameters<typeof weekSentence>[0]>) => ({
  weekStart: "2026-10-26",
  weekEnd: "2026-11-01",
  receivedMinor: 0,
  spentMinor: 0,
  savedMinor: 0,
  stillDueMinor: 0,
  ...over,
});

describe("weekSentence", () => {
  it("reads the week as one sentence, never as figures", () => {
    expect(
      weekSentence(week({ receivedMinor: 500, spentMinor: 300, savedMinor: 200 }), money),
    ).toBe("This week £5 came in, you spent £3 and £2 went into Save.");
  });
  it("names money that came out of Save", () => {
    expect(weekSentence(week({ savedMinor: -400 }), money)).toBe("This week £4 came out of Save.");
  });
  it("stays calm when nothing moved", () => {
    expect(weekSentence(week({}), money)).toBe("No money moved this week.");
  });
  it("joins two parts with and", () => {
    expect(weekSentence(week({ receivedMinor: 500, spentMinor: 100 }), money)).toBe(
      "This week £5 came in and you spent £1.",
    );
  });
});
