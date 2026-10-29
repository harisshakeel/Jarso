import { describe, expect, it } from "vitest";
import {
  cadenceAfterAmount,
  describeAllowanceState,
  describeCadence,
  describeSchedule,
  formatDay,
  prefillSplit,
  toMajorString,
} from "./describe";
import type { Schedule } from "./types";

describe("describeCadence", () => {
  it("describes each frequency from the anchor, with no start date", () => {
    expect(describeCadence("weekly", "2025-11-02", "en-GB")).toBe("Every Sunday");
    expect(describeCadence("monthly", "2026-01-31", "en-GB")).toBe("Every month on the 31st");
    expect(describeCadence("quarterly", "2026-11-30", "en-GB")).toBe("Every 3 months on the 30th");
    expect(describeCadence("annual", "2026-11-02", "en-GB")).toBe("Every year on 2 Nov");
  });

  it("reads after an amount without lower-casing names", () => {
    expect(cadenceAfterAmount("weekly", "2025-11-02")).toBe("every Sunday");
    expect(cadenceAfterAmount("annual", "2026-11-02")).toBe("every year on 2 Nov");
  });
});

describe("describeSchedule", () => {
  it("names the weekday for a weekly allowance", () => {
    expect(describeSchedule("weekly", "2025-11-02", "en-GB")).toBe("Every Sunday from 2 Nov");
  });

  it("names the day of the month for a monthly allowance", () => {
    expect(describeSchedule("monthly", "2026-01-31", "en-GB")).toBe(
      "Every month on the 31st from 31 Jan",
    );
    expect(describeSchedule("monthly", "2026-01-02")).toBe("Every month on the 2nd from 2 Jan");
    expect(describeSchedule("monthly", "2026-01-13")).toBe("Every month on the 13th from 13 Jan");
  });

  it("describes quarterly and annual allowances", () => {
    expect(describeSchedule("quarterly", "2026-11-30", "en-GB")).toBe("Every 3 months from 30 Nov");
    expect(describeSchedule("annual", "2026-11-02", "en-GB")).toBe("Every year from 2 Nov");
  });
});

describe("prefillSplit", () => {
  it("puts everything in Spend the first time", () => {
    expect(prefillSplit(500, null)).toEqual({ cash: 500, saved: 0 });
  });

  it("applies the last save share to the current amount", () => {
    expect(prefillSplit(500, { cash: 300, saved: 200 })).toEqual({ cash: 300, saved: 200 });
    expect(prefillSplit(1000, { cash: 300, saved: 200 })).toEqual({ cash: 600, saved: 400 });
  });

  it("rounds the saved part down and gives Spend the rest", () => {
    expect(prefillSplit(333, { cash: 1, saved: 1 })).toEqual({ cash: 167, saved: 166 });
  });
});

describe("formatDay and toMajorString", () => {
  it("formats a day without shifting it", () => {
    expect(formatDay("2026-11-02")).toBe("2 Nov");
  });

  it("turns minor units into an input value", () => {
    expect(toMajorString(50000, "INR")).toBe("500.00");
    expect(toMajorString(550, "GBP")).toBe("5.50");
    expect(toMajorString(500, "JPY")).toBe("500");
  });
});

describe("describeAllowanceState", () => {
  const base: Schedule = {
    id: "s1",
    amountMinor: 500,
    frequency: "weekly",
    status: "active",
    anchorOn: "2026-11-01",
    nextDueOn: "2026-11-08",
    pausedThrough: null,
    pauseMessage: null,
  };

  it("reads the next date, pause, stop and none", () => {
    expect(describeAllowanceState(null)).toBe("No allowance yet");
    expect(describeAllowanceState(base)).toBe("Next: 8 Nov");
    expect(describeAllowanceState({ ...base, status: "stopped", nextDueOn: null })).toBe("Stopped");
    expect(describeAllowanceState({ ...base, status: "paused", pausedThrough: "2026-11-20" })).toBe(
      "Paused until 20 Nov",
    );
    expect(describeAllowanceState({ ...base, status: "paused", nextDueOn: null })).toBe("Paused");
  });
});
