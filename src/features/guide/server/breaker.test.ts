import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./breaker";

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
