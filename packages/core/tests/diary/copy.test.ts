import {
  notEnoughSpendMessage,
  notEnoughSpendToLowerMessage,
  notEnoughSpendToRaiseMessage,
} from "@jarso/core/diary";
import { describe, expect, it } from "vitest";

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

describe("fix refusals", () => {
  it("names the most a purchase can be", () => {
    expect(notEnoughSpendToRaiseMessage(350, 100, "GBP")).toBe(
      "That's more than you have in Spend. The most it can be is £4.50.",
    );
  });

  it("names the least money received can be, never below zero", () => {
    expect(notEnoughSpendToLowerMessage(2000, 500, "GBP")).toBe(
      "You've spent some of this already. The least it can be is £15.",
    );
    expect(notEnoughSpendToLowerMessage(200, 500, "GBP")).toBe(
      "You've spent some of this already. The least it can be is £0.",
    );
  });
});
