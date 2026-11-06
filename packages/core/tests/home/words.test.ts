import { describe, expect, it } from "vitest";
import { capitalise, wordCount } from "../../src/home";

describe("words", () => {
  it("counts words, not symbols", () => {
    expect(wordCount("₹40 saved this week. Nice!")).toBe(5);
    expect(wordCount("+₹50 · Mum hands it over")).toBe(5);
  });
  it("capitalises a sentence start", () => expect(capitalise("your parent")).toBe("Your parent"));
});
