import { describe, expect, it } from "vitest";
import { takeOutLimit } from "./limit";

const base = {
  spendMinor: 0,
  saveMinor: 3100,
  reservedSaveMinor: 500,
  heldSpendMinor: 0,
  availableSaveMinor: 2600,
  availableSpendMinor: 0,
};

describe("takeOutLimit", () => {
  it("is the free Save when there is no cap", () => {
    expect(takeOutLimit({ ...base, takeOutLimitMinor: null })).toBe(2600);
  });

  it("is the cap room when there is one (already no more than free Save)", () => {
    expect(takeOutLimit({ ...base, takeOutLimitMinor: 800 })).toBe(800);
    expect(takeOutLimit({ ...base, takeOutLimitMinor: 0 })).toBe(0);
  });
});
