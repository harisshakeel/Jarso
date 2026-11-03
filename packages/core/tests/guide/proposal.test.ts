import {
  acceptGoalProposalSchema,
  describeProposal,
  emojiForGoal,
  goalProposalFrom,
} from "@jarso/core/guide";
import { describe, expect, it } from "vitest";

describe("goalProposalFrom", () => {
  it("parses the amounts in code and gives the goal a picture and a line of figures", () => {
    expect(
      goalProposalFrom({ title: " Headphones ", price: "£30", save_each: "5" }, "GBP", 6),
    ).toEqual({
      kind: "goal",
      title: "Headphones",
      emoji: "🎧",
      priceMinor: 3000,
      saveEachMinor: 500,
      allowances: 6,
      figures: "£30 · £5 each allowance · about 6 allowances",
    });
  });

  it("offers nothing for an amount it can't read or one over the goal limit", () => {
    expect(goalProposalFrom({ title: "Bike", price: "a lot", save_each: null }, "GBP")).toBeNull();
    expect(goalProposalFrom({ title: "Bike", price: "20000", save_each: null }, "GBP")).toBeNull();
    expect(goalProposalFrom({ title: "Bike", price: "120", save_each: "loads" }, "GBP")).toBeNull();
  });

  it("treats an empty plan as no plan", () => {
    expect(
      goalProposalFrom({ title: "Bike", price: "120", save_each: "" }, "GBP")?.saveEachMinor,
    ).toBeNull();
  });
});

describe("emojiForGoal", () => {
  it("picks a picture from the goal's name, or a star", () => {
    expect(emojiForGoal("New bike")).toBe("🚲");
    expect(emojiForGoal("Football boots")).toBe("⚽");
    expect(emojiForGoal("Something I want")).toBe("⭐");
  });
});

describe("describeProposal", () => {
  it("says one allowance in the singular and leaves out what isn't known", () => {
    expect(describeProposal({ priceMinor: 1250, saveEachMinor: null, allowances: 1 }, "GBP")).toBe(
      "£12.50 · about 1 allowance",
    );
    expect(
      describeProposal({ priceMinor: 1250, saveEachMinor: null, allowances: null }, "GBP"),
    ).toBe("£12.50");
  });
});

describe("acceptGoalProposalSchema", () => {
  it("checks what the card sends back", () => {
    const ok = acceptGoalProposalSchema.safeParse({
      title: "Bike",
      emoji: "🚲",
      priceMinor: 12000,
      saveEachMinor: null,
    });
    expect(ok.success && ok.data.replace).toBe(false);
    expect(
      acceptGoalProposalSchema.safeParse({
        title: "Bike",
        emoji: "🦄",
        priceMinor: 12000,
        saveEachMinor: null,
      }).success,
    ).toBe(false);
    expect(
      acceptGoalProposalSchema.safeParse({
        title: "Bike",
        emoji: "🚲",
        priceMinor: 2_000_000,
        saveEachMinor: null,
      }).success,
    ).toBe(false);
  });
});
