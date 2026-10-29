import { describe, expect, it } from "vitest";
import { describeAnswer, gradeStep, needsReplay } from "./grade";
import type { StepBody } from "./types";

const hints: [string, string] = ["Gentle hint", "Strong hint"];

const choice: StepBody = {
  type: "choice",
  skill: "balance.afford",
  prompt: "You have {m:900}. Which can you buy?",
  options: [
    { id: "book", text: "A book for {m:750}", feedback: "Yes" },
    { id: "game", text: "A game for {m:1200}", feedback: "That costs more than {m:900}." },
  ],
  answer: "book",
  hints,
  correct: "Nice. That's it.",
};

const amount: StepBody = {
  type: "amount",
  skill: "goal.weeks_needed",
  prompt: "Goal {m:3000}, saving {m:400} a week. How many weeks?",
  unit: "count",
  suffix: "weeks",
  answer: 8,
  misconceptions: [{ value: 7, feedback: "Seven weeks gets you to {m:2800}. Round up." }],
  wrong: "Not quite. Try dividing.",
  hints,
  correct: "Eight weeks.",
};

const split: StepBody = {
  type: "split",
  skill: "split.amounts",
  prompt: "Split {m:1000} so at least {m:300} goes to Save.",
  total: 1000,
  increment: 50,
  rule: { minSave: 300 },
  wrong: "Save needs at least {m:300}.",
  hints,
  correct: "Good split.",
};

const sort: StepBody = {
  type: "sort",
  skill: "tradeoff.need_want",
  prompt: "Need or want?",
  buckets: [
    { id: "need", label: "Need" },
    { id: "want", label: "Want" },
  ],
  items: [
    { id: "lunch", text: "School lunch", bucket: "need" },
    { id: "sweets", text: "Sweets", bucket: "want" },
    { id: "shoes", text: "Shoes that fit", bucket: "need" },
  ],
  wrong: "Look again at one of them.",
  hints,
  correct: "All sorted.",
};

const match: StepBody = {
  type: "match",
  skill: "split.share",
  prompt: "Match each word.",
  pairs: [
    { id: "spend", term: "Spend", meaning: "Cash you hold" },
    { id: "save", term: "Save", meaning: "Money your parent keeps for you" },
    { id: "due", term: "Due", meaning: "Waiting to be handed over" },
  ],
  wrong: "One pair is mixed up.",
  hints,
  correct: "All matched.",
};

describe("gradeStep", () => {
  it("grades a choice and returns the chosen option's feedback when wrong", () => {
    expect(gradeStep(choice, { kind: "option", optionId: "book" })).toEqual({
      correct: true,
      feedback: "Nice. That's it.",
    });
    expect(gradeStep(choice, { kind: "option", optionId: "game" })).toEqual({
      correct: false,
      feedback: "That costs more than {m:900}.",
    });
  });

  it("treats an unknown option or the wrong answer kind as wrong", () => {
    expect(gradeStep(choice, { kind: "option", optionId: "nope" }).correct).toBe(false);
    expect(gradeStep(choice, { kind: "number", value: 750 }).correct).toBe(false);
  });

  it("grades an amount and names a known misconception", () => {
    expect(gradeStep(amount, { kind: "number", value: 8 }).correct).toBe(true);
    expect(gradeStep(amount, { kind: "number", value: 7 }).feedback).toMatch(/Round up/);
    expect(gradeStep(amount, { kind: "number", value: 3 }).feedback).toBe(
      "Not quite. Try dividing.",
    );
  });

  it("grades a split against its rule", () => {
    expect(gradeStep(split, { kind: "split", save: 300 }).correct).toBe(true);
    expect(gradeStep(split, { kind: "split", save: 1000 }).correct).toBe(true);
    expect(gradeStep(split, { kind: "split", save: 250 }).correct).toBe(false);
    expect(gradeStep(split, { kind: "split", save: 1050 }).correct).toBe(false);
  });

  it("needs every item sorted into its bucket", () => {
    const right = { lunch: "need", sweets: "want", shoes: "need" };
    expect(gradeStep(sort, { kind: "sort", placements: right }).correct).toBe(true);
    expect(gradeStep(sort, { kind: "sort", placements: { ...right, shoes: "want" } }).correct).toBe(
      false,
    );
    expect(gradeStep(sort, { kind: "sort", placements: { lunch: "need" } }).correct).toBe(false);
  });

  it("needs every pair matched", () => {
    const right = { spend: "spend", save: "save", due: "due" };
    expect(gradeStep(match, { kind: "match", pairs: right }).correct).toBe(true);
    expect(
      gradeStep(match, { kind: "match", pairs: { ...right, save: "due", due: "save" } }).correct,
    ).toBe(false);
  });
});

describe("describeAnswer", () => {
  it("shows the right answer in the family currency", () => {
    expect(describeAnswer(choice, "GBP")).toBe("A book for £7.50");
    expect(describeAnswer(amount, "GBP")).toBe("8 weeks");
    expect(describeAnswer(split, "GBP")).toBe("at least £3 to Save");
    expect(describeAnswer(sort, "GBP")).toBe("Need: School lunch, Shoes that fit. Want: Sweets");
  });
});

describe("needsReplay", () => {
  it("replays anything not right on the first try", () => {
    expect(needsReplay({ correct: true, tries: 1 })).toBe(false);
    expect(needsReplay({ correct: true, tries: 2 })).toBe(true);
    expect(needsReplay({ correct: false, tries: 2 })).toBe(true);
  });
});
