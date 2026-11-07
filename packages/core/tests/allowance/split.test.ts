import {
  allowanceFormCopy,
  allowanceSummaryCopy,
  DEFAULT_SAVE_SHARE,
  handoverPrefill,
  SAVE_SHARES,
  saveForShare,
  scheduleSplit,
  shareOfSave,
} from "@jarso/core/allowance";
import { describe, expect, it } from "vitest";

describe("saveForShare", () => {
  it("rounds Save down to a whole unit and leaves the rest to Spend", () => {
    expect(saveForShare(50000, 25, "INR")).toBe(12500);
    expect(saveForShare(500, 25, "GBP")).toBe(100); // £1.25 → £1
    expect(saveForShare(1000, 25, "JPY")).toBe(250);
    expect(saveForShare(999, 50, "GBP")).toBe(400); // £4.995 → £4
    expect(saveForShare(12345, 10, "INR")).toBe(1200);
  });

  it("is 0 for All Spend, for an empty amount and under one whole unit", () => {
    expect(saveForShare(50000, 0, "INR")).toBe(0);
    expect(saveForShare(0, 25, "INR")).toBe(0);
    expect(saveForShare(90, 50, "GBP")).toBe(0);
  });

  it("is the whole amount at 100", () => {
    expect(saveForShare(999, 100, "GBP")).toBe(999);
  });

  it("starts a new allowance at a quarter, one of the offered shares", () => {
    expect(DEFAULT_SAVE_SHARE).toBe(25);
    expect(SAVE_SHARES).toContain(DEFAULT_SAVE_SHARE);
    expect(SAVE_SHARES[0]).toBe(0);
  });
});

describe("shareOfSave", () => {
  it("finds the offered share that gives this Save", () => {
    expect(shareOfSave(50000, 12500, "INR")).toBe(25);
    expect(shareOfSave(50000, 0, "INR")).toBe(0);
    expect(shareOfSave(50000, 25000, "INR")).toBe(50);
  });

  it("is null for a typed Save that no share gives", () => {
    expect(shareOfSave(50000, 12345, "INR")).toBeNull();
  });

  it("reads 0 under one whole unit as All Spend", () => {
    expect(shareOfSave(90, 0, "GBP")).toBe(0);
  });
});

describe("scheduleSplit", () => {
  it("always adds up to the amount", () => {
    for (const [amount, save] of [
      [50000, 12500],
      [999, 400],
      [1, 0],
      [1, 1],
    ] as const) {
      const split = scheduleSplit(amount, save);
      expect(split.cash + split.saved).toBe(amount);
      expect(split.saved).toBe(save);
    }
  });

  it("clamps a Save over the amount or below 0", () => {
    expect(scheduleSplit(500, 900)).toEqual({ cash: 0, saved: 500 });
    expect(scheduleSplit(500, -5)).toEqual({ cash: 500, saved: 0 });
  });
});

describe("handoverPrefill", () => {
  const last = { cash: 300, saved: 200 };

  it("uses the allowance's planned split", () => {
    expect(handoverPrefill({ amountMinor: 1000, plannedSaveMinor: 250 }, last)).toEqual({
      split: { cash: 750, saved: 250 },
      from: "plan",
    });
  });

  it("keeps a planned All Spend", () => {
    expect(handoverPrefill({ amountMinor: 1000, plannedSaveMinor: 0 }, last)).toEqual({
      split: { cash: 1000, saved: 0 },
      from: "plan",
    });
  });

  it("falls back to the last handover's share without a plan", () => {
    expect(handoverPrefill({ amountMinor: 1000, plannedSaveMinor: null }, last)).toEqual({
      split: { cash: 600, saved: 400 },
      from: "last",
    });
  });

  it("is all Spend with no plan and no handover yet", () => {
    expect(handoverPrefill({ amountMinor: 1000, plannedSaveMinor: null }, null)).toEqual({
      split: { cash: 1000, saved: 0 },
      from: "none",
    });
  });
});

describe("split copy", () => {
  it("names the shares and the line", () => {
    expect(allowanceFormCopy.shareLabel(0)).toBe("All Spend");
    expect(allowanceFormCopy.shareLabel(25)).toBe("25% Save");
    expect(allowanceFormCopy.splitLine("₹375", "₹125")).toBe("₹375 to Spend · ₹125 to Save");
    expect(allowanceSummaryCopy.split("£4", "£1")).toBe("£4 to Spend · £1 to Save");
  });
});
