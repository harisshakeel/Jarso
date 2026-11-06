import type { Outcome } from "@jarso/core/goals";
import { describe, expect, it } from "vitest";
import { BUBBLE_MAX_WORDS, guessCopy, guessResult, wordCount } from "../../src/home";

const outcome = (o: Partial<Outcome>): Outcome => ({
  actual: "closer",
  before: 5,
  after: 3,
  remainingBefore: 500,
  remainingAfter: 300,
  ...o,
});

describe("guessResult", () => {
  it("same gives null", () =>
    expect(guessResult(outcome({ actual: "same" }), "closer")).toBeNull());
  it("closer by 2 allowances", () =>
    expect(guessResult(outcome({}), "closer")).toEqual({
      right: true,
      line: "Yes! 2 allowances closer.",
    }));
  it("singular for one allowance", () =>
    expect(guessResult(outcome({ before: 4, after: 3 }), "closer")?.line).toBe(
      "Yes! 1 allowance closer.",
    ));
  it("no plan says a bit closer", () =>
    expect(guessResult(outcome({ before: null, after: null }), "closer")?.line).toBe(
      "Yes! A bit closer.",
    ));
  it("wrong guess is kind", () => {
    const r = guessResult(outcome({ actual: "further", before: 3, after: 5 }), "closer");
    expect(r?.right).toBe(false);
    expect(r?.line).toBe("Good guess! 2 allowances further.");
    expect(wordCount(r?.line ?? "")).toBeLessThanOrEqual(BUBBLE_MAX_WORDS);
  });
  it("wrong guess with no plan is still kind", () =>
    expect(
      guessResult(outcome({ actual: "further", before: null, after: null }), "closer")?.line,
    ).toBe("Good guess! A bit further."));
  it("question reads", () => expect(guessCopy.question("⚽")).toBe("⚽ Your goal gets…"));
});
