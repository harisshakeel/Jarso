import { describe, expect, it } from "vitest";
import {
  cadenceAfterAmount,
  cashForSaved,
  checkSplit,
  describeAllowanceState,
  describeCadence,
  describeSchedule,
  formatDay,
  prefillSplit,
  shareOf,
  splitAtShare,
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

describe("checkSplit", () => {
  it("notes the shortfall when an allowance handover is less than was due (D1)", () => {
    expect(checkSplit(300, 100, 500, "allowance")).toEqual({
      valid: true,
      total: 400,
      short: 100,
      over: false,
    });
  });

  it("has no shortfall for a full handover", () => {
    expect(checkSplit(300, 200, 500, "allowance")).toMatchObject({ short: 0, over: false });
  });

  it("flags an allowance handover over the amount due", () => {
    expect(checkSplit(400, 200, 500, "allowance")).toMatchObject({ short: 0, over: true });
  });

  it("has no shortfall and no cap for gifts", () => {
    expect(checkSplit(100, 0, 500, "gift")).toMatchObject({ short: 0, over: false });
    expect(checkSplit(900, 0, 500, "gift")).toMatchObject({ short: 0, over: false });
  });

  it("is invalid, with nothing short, while an input doesn't parse", () => {
    expect(checkSplit(null, 100, 500, "allowance")).toEqual({
      valid: false,
      total: 0,
      short: 0,
      over: false,
    });
  });

  it("does not call an empty handover short", () => {
    expect(checkSplit(0, 0, 500, "allowance")).toMatchObject({ short: 0 });
  });
});

describe("splitAtShare and shareOf", () => {
  it("moves the slider's share to Save and the rest to Spend", () => {
    expect(splitAtShare(500, 40)).toEqual({ cash: 300, saved: 200 });
    expect(splitAtShare(333, 50)).toEqual({ cash: 166, saved: 167 });
  });

  it("puts the slider in steps of 5, capped at 100", () => {
    expect(shareOf(200, 500)).toBe(40);
    expect(shareOf(110, 500)).toBe(20);
    expect(shareOf(900, 500)).toBe(100);
    expect(shareOf(100, 0)).toBe(0);
  });
});

describe("cashForSaved", () => {
  it("gives Spend the rest of what was due", () => {
    expect(cashForSaved(100, 500)).toBe(400);
    expect(cashForSaved(500, 500)).toBe(0);
  });

  it("leaves Spend alone when Save doesn't parse or is more than was due", () => {
    expect(cashForSaved(null, 500)).toBeNull();
    expect(cashForSaved(600, 500)).toBeNull();
  });
});

describe("formatDay", () => {
  it("formats a day without shifting it", () => {
    expect(formatDay("2026-11-02")).toBe("2 Nov");
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
