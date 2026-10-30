import { describe, expect, it } from "vitest";
import { notEnoughSpendMessage } from "./copy";

describe("notEnoughSpendMessage", () => {
  it("says the jar is empty when nothing is free", () => {
    expect(notEnoughSpendMessage(0, "GBP")).toBe(
      "Your Spend jar is empty right now. Record money you got first, or ask a parent.",
    );
  });

  it("names what is left otherwise", () => {
    expect(notEnoughSpendMessage(300, "GBP")).toBe(
      "That's more than you have in Spend (£3). Record money you got first, or ask a parent.",
    );
  });
});
