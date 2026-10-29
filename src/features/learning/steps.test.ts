import { describe, expect, it } from "vitest";
import { recordStepSchema, stepAnswerSchema } from "./schemas";
import { bodyFor, draftToAnswer, emptyDraft, stableShuffle } from "./steps";
import { formatShortDate, renderText, wordCount } from "./text";
import type { AnswerableStep, StepBody } from "./types";

const hints: [string, string] = ["h1", "h2"];
const money: StepBody = {
  type: "amount",
  skill: "balance.afford",
  prompt: "How much is left?",
  unit: "money",
  answer: 600,
  misconceptions: [],
  wrong: "Not quite.",
  hints,
  correct: "Yes.",
};
const count: StepBody = { ...money, unit: "count", answer: 4, suffix: "packs" };

describe("draftToAnswer", () => {
  it("reads money in the family currency", () => {
    expect(draftToAnswer(money, { kind: "number", text: "6" }, "GBP")).toEqual({
      kind: "number",
      value: 600,
    });
    expect(draftToAnswer(money, { kind: "number", text: "£6.00" }, "GBP")).toEqual({
      kind: "number",
      value: 600,
    });
    expect(draftToAnswer(money, { kind: "number", text: "600" }, "JPY")).toEqual({
      kind: "number",
      value: 600,
    });
    expect(draftToAnswer(money, { kind: "number", text: "6.001" }, "GBP")).toBeNull();
    expect(draftToAnswer(money, { kind: "number", text: "" }, "GBP")).toBeNull();
  });

  it("reads a whole count and nothing else", () => {
    expect(draftToAnswer(count, { kind: "number", text: "4" }, "GBP")).toEqual({
      kind: "number",
      value: 4,
    });
    expect(draftToAnswer(count, { kind: "number", text: "4.5" }, "GBP")).toBeNull();
    expect(draftToAnswer(count, { kind: "number", text: "-1" }, "GBP")).toBeNull();
  });

  it("waits until every sort item is placed", () => {
    const sort: StepBody = {
      type: "sort",
      skill: "tradeoff.need_want",
      prompt: "Sort",
      buckets: [
        { id: "need", label: "Need" },
        { id: "want", label: "Want" },
      ],
      items: [
        { id: "a", text: "A", bucket: "need" },
        { id: "b", text: "B", bucket: "want" },
        { id: "c", text: "C", bucket: "need" },
      ],
      wrong: "w",
      hints,
      correct: "c",
    };
    expect(draftToAnswer(sort, { kind: "sort", placements: { a: "need" } }, "GBP")).toBeNull();
    expect(
      draftToAnswer(sort, { kind: "sort", placements: { a: "need", b: "want", c: "need" } }, "GBP"),
    ).toMatchObject({ kind: "sort" });
  });
});

describe("emptyDraft", () => {
  it("starts a split slider near the middle, on a step", () => {
    const split: StepBody = {
      type: "split",
      skill: "split.amounts",
      prompt: "Split",
      total: 1000,
      increment: 100,
      rule: { minSave: 300 },
      wrong: "w",
      hints,
      correct: "c",
    };
    expect(emptyDraft(split)).toEqual({ kind: "split", save: 500 });
  });
});

describe("bodyFor", () => {
  it("uses the replay variant only in the replay phase", () => {
    const step: AnswerableStep = { ...count, key: "packs", replay: { ...count, answer: 3 } };
    expect((bodyFor(step, "main") as { answer: number }).answer).toBe(4);
    expect((bodyFor(step, "replay") as { answer: number }).answer).toBe(3);
    const noReplay: AnswerableStep = { ...count, key: "packs" };
    expect((bodyFor(noReplay, "replay") as { answer: number }).answer).toBe(4);
  });
});

describe("stableShuffle", () => {
  it("is the same every time for the same seed", () => {
    const items = ["a", "b", "c", "d"];
    const first = stableShuffle(items, "seed", (x) => x);
    expect(stableShuffle(items, "seed", (x) => x)).toEqual(first);
    expect([...first].sort()).toEqual(items);
  });
});

describe("text", () => {
  it("renders money tokens in the family currency", () => {
    expect(renderText("You have {m:1250} and {m:400}.", "GBP")).toBe("You have £12.50 and £4.");
    expect(renderText("You have {m:1250}.", "USD")).toBe("You have US$12.50.");
  });

  it("counts a money token as one word", () => {
    expect(wordCount("You have {m:1250} in Spend.")).toBe(5);
  });

  it("formats a short date", () => {
    expect(formatShortDate("2026-10-30")).toBe("30 Oct");
  });
});

describe("action inputs", () => {
  it("accept only well-formed answers", () => {
    expect(stepAnswerSchema.safeParse({ kind: "option", optionId: "comic" }).success).toBe(true);
    expect(stepAnswerSchema.safeParse({ kind: "option", optionId: "<script>" }).success).toBe(
      false,
    );
    expect(stepAnswerSchema.safeParse({ kind: "number", value: 1.5 }).success).toBe(false);
    const tooMany = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, "v"]));
    expect(stepAnswerSchema.safeParse({ kind: "sort", placements: tooMany }).success).toBe(false);
  });

  it("cap hints and tries", () => {
    const base = {
      attemptId: "7d5f2c39-0b8e-4a6e-9a11-1c2d3e4f5a6b",
      stepKey: "which-can-you-buy",
      phase: "main",
      answer: { kind: "option", optionId: "comic" },
      hintsUsed: 0,
      tries: 1,
    };
    expect(recordStepSchema.safeParse(base).success).toBe(true);
    expect(recordStepSchema.safeParse({ ...base, hintsUsed: 3 }).success).toBe(false);
    expect(recordStepSchema.safeParse({ ...base, tries: 0 }).success).toBe(false);
    expect(recordStepSchema.safeParse({ ...base, phase: "bonus" }).success).toBe(false);
  });
});
