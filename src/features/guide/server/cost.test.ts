import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./breaker";
import { addUsage, usageCents, zeroUsage } from "./cost";

describe("usageCents", () => {
  it("prices a typical turn at about a cent", () => {
    // ~800 uncached input, ~4k cached prompt, ~350 output, plus two Haiku screens.
    const cents = usageCents({
      mainInput: 800,
      mainOutput: 350,
      mainCacheRead: 4000,
      mainCacheWrite: 0,
      screenInput: 1600,
      screenOutput: 120,
    });
    expect(cents).toBeGreaterThan(0.9);
    expect(cents).toBeLessThan(1.3);
  });

  it("charges cache writes at 1.25 times input", () => {
    expect(usageCents({ ...zeroUsage, mainCacheWrite: 1_000_000 })).toBeCloseTo(500);
    expect(usageCents({ ...zeroUsage, mainInput: 1_000_000 })).toBeCloseTo(400);
  });

  it("adds usage", () => {
    expect(addUsage(zeroUsage, { mainInput: 3, screenOutput: 2 })).toMatchObject({
      mainInput: 3,
      screenOutput: 2,
    });
  });
});

describe("CircuitBreaker", () => {
  it("opens after five failures in a minute and closes after the cooldown", () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 4; i++) breaker.recordFailure(1_000 + i);
    expect(breaker.isOpen(2_000)).toBe(false);
    breaker.recordFailure(2_000);
    expect(breaker.isOpen(2_001)).toBe(true);
    expect(breaker.isOpen(62_001)).toBe(false);
  });

  it("forgets failures older than the window", () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < 4; i++) breaker.recordFailure(0);
    breaker.recordFailure(61_000);
    expect(breaker.isOpen(61_001)).toBe(false);
  });
});
