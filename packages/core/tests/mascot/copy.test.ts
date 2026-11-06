import { LID_COLORS, lookCopy, WEAR_UNLOCK_LEVEL, type Wear } from "@jarso/core/mascot";
import { describe, expect, it } from "vitest";

describe("lookCopy", () => {
  it("names every lid colour", () => {
    for (const lid of LID_COLORS) expect(lookCopy.lid[lid].length).toBeGreaterThan(0);
  });

  it("names every wear option", () => {
    for (const wear of Object.keys(WEAR_UNLOCK_LEVEL) as Wear[]) {
      expect(lookCopy.wear[wear].length).toBeGreaterThan(0);
    }
  });

  it("a locked option says the level that unlocks it", () => {
    expect(lookCopy.unlocksAt(4)).toBe("Level 4");
    expect(lookCopy.lockedLabel("Headphones", 4)).toBe("Headphones, unlocks at level 4");
  });

  it("chosen options read as selected labels", () => {
    expect(lookCopy.lidLabel("Grape")).toBe("Grape lid");
  });
});
