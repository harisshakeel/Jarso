import { describe, expect, it } from "vitest";
import { addUsage, usageCents, zeroUsage } from "./cost";

describe("usageCents", () => {
  it("prices a turn with no look-ups well under a cent", () => {
    // ~800 uncached input, ~4k cached prompt, ~350 output, plus two Haiku screens.
    const cents = usageCents({
      mainInput: 800,
      mainOutput: 350,
      mainCacheRead: 4000,
      mainCacheWrite: 0,
      screenInput: 1600,
      screenOutput: 120,
    });
    expect(cents).toBeGreaterThan(0.5);
    expect(cents).toBeLessThan(0.7);
  });

  it("prices a turn with one round of look-ups at about a cent and a half", () => {
    // Two calls: the second reads the first's prefix from the cache and adds the tool results.
    const cents = usageCents({
      mainInput: 2000,
      mainOutput: 500,
      mainCacheRead: 9000,
      mainCacheWrite: 1500,
      screenInput: 1600,
      screenOutput: 120,
    });
    expect(cents).toBeGreaterThan(1.3);
    expect(cents).toBeLessThan(1.7);
  });

  it("charges cache writes at 1.25 times input", () => {
    expect(usageCents({ ...zeroUsage, mainCacheWrite: 1_000_000 })).toBeCloseTo(250);
    expect(usageCents({ ...zeroUsage, mainInput: 1_000_000 })).toBeCloseTo(200);
  });

  it("prices earlier replies at their own model's rate", () => {
    expect(usageCents({ ...zeroUsage, mainInput: 1_000_000 }, "claude-opus-5-5")).toBeCloseTo(400);
  });

  it("adds usage", () => {
    expect(addUsage(zeroUsage, { mainInput: 3, screenOutput: 2 })).toMatchObject({
      mainInput: 3,
      screenOutput: 2,
    });
  });
});
