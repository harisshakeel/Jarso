import { describe, expect, it } from "vitest";
import { checkIn, missions, reservedMissionKeys, reviewPool, topics } from "./content";
import { gradeStep } from "./grade";
import { skillKeys, topicKeys } from "./skills";
import { bodyFor, isAnswerable } from "./steps";
import { wordCount } from "./text";
import type { AnswerableStep, StepAnswer, StepBody } from "./types";

/**
 * Loading ./content already validates every file with Zod (an invalid file throws on import).
 * These tests add the authoring rules from the spec (§4.4) that a schema can't express.
 */

const everyStep: { where: string; step: AnswerableStep }[] = [
  ...missions.flatMap((m) =>
    m.steps.filter(isAnswerable).map((step) => ({ where: `${m.key}/${step.key}`, step })),
  ),
  ...reviewPool.map((step) => ({ where: `reviews/${step.key}`, step })),
  ...checkIn.questions.map((step) => ({ where: `check-in/${step.key}`, step })),
  ...topics.map((t) => ({ where: `topics/${t.key}`, step: t.practice })),
];

const bodies: { where: string; body: StepBody }[] = everyStep.flatMap(({ where, step }) => [
  { where, body: bodyFor(step, "main") },
  ...(step.replay ? [{ where: `${where} (replay)`, body: bodyFor(step, "replay") }] : []),
]);

/** Every piece of text a child reads in a step. */
function texts(body: StepBody): string[] {
  const out = [body.prompt, body.correct, ...body.hints];
  switch (body.type) {
    case "choice":
    case "predict":
    case "reason":
      out.push(...body.options.flatMap((o) => [o.text, o.feedback]));
      if (body.type === "predict") out.push(body.outcome);
      break;
    case "amount":
      out.push(body.wrong, ...body.misconceptions.map((m) => m.feedback));
      break;
    case "split":
    case "sort":
    case "match":
      out.push(body.wrong);
      break;
  }
  return out;
}

/** The right answer for a step, built from its definition. */
function rightAnswer(body: StepBody): StepAnswer {
  switch (body.type) {
    case "choice":
    case "predict":
    case "reason":
      return { kind: "option", optionId: body.answer };
    case "amount":
      return { kind: "number", value: body.answer };
    case "split": {
      const { minSave, maxSave, exactSave } = body.rule;
      return { kind: "split", save: exactSave ?? minSave ?? maxSave ?? 0 };
    }
    case "sort":
      return {
        kind: "sort",
        placements: Object.fromEntries(body.items.map((i) => [i.id, i.bucket])),
      };
    case "match":
      return { kind: "match", pairs: Object.fromEntries(body.pairs.map((p) => [p.id, p.id])) };
  }
}

describe("learning content", () => {
  it("has a seven-day journey, five topics, a five-question check-in", () => {
    expect(missions.map((m) => m.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(topics.map((t) => t.key).sort()).toEqual([...topicKeys].sort());
    expect(checkIn.questions).toHaveLength(5);
  });

  it("never uses a key that is also a route", () => {
    for (const mission of missions) {
      expect(reservedMissionKeys as readonly string[]).not.toContain(mission.key);
    }
  });

  it("starts every mission with an explanation and keeps it to 6 to 8 steps", () => {
    for (const mission of missions) {
      expect(mission.steps[0]?.type, mission.key).toBe("info");
      expect(mission.steps.length, mission.key).toBeGreaterThanOrEqual(6);
      expect(mission.steps.length, mission.key).toBeLessThanOrEqual(8);
    }
  });

  it("asks the child to predict or explain at least once per mission (FR06)", () => {
    for (const mission of missions) {
      expect(
        mission.steps.some((s) => s.type === "predict" || s.type === "reason"),
        mission.key,
      ).toBe(true);
    }
  });

  it("has at least four review items for every skill, in new situations", () => {
    for (const skill of skillKeys) {
      expect(
        reviewPool.filter((item) => item.skill === skill).length,
        skill,
      ).toBeGreaterThanOrEqual(4);
    }
    const reviewKeys = reviewPool.map((item) => item.key);
    expect(new Set(reviewKeys).size).toBe(reviewKeys.length);
  });

  it("covers every skill in some mission and links each skill to one topic", () => {
    const taught = new Set(
      missions.flatMap((m) => m.steps.filter(isAnswerable).map((s) => s.skill)),
    );
    for (const skill of skillKeys) {
      expect(taught.has(skill), skill).toBe(true);
      expect(
        topics.filter((t) => t.skills.includes(skill)),
        skill,
      ).toHaveLength(1);
    }
  });

  it("keeps prompts to 25 words", () => {
    for (const { where, body } of bodies) {
      expect(wordCount(body.prompt), where).toBeLessThanOrEqual(25);
    }
  });

  it("follows the voice rules: no 'incorrect', 'oops', or exclamation marks in corrections", () => {
    for (const { where, body } of bodies) {
      for (const text of texts(body)) {
        expect(text, where).not.toMatch(
          /\bincorrect\b|\boops\b|\bwrong!|\bstupid\b|\bfail(ed)?\b/i,
        );
      }
      const corrections =
        body.type === "amount"
          ? [body.wrong, ...body.misconceptions.map((m) => m.feedback)]
          : "wrong" in body
            ? [body.wrong]
            : body.options.filter((o) => o.id !== body.answer).map((o) => o.feedback);
      for (const text of corrections) expect(text, where).not.toContain("!");
    }
  });

  it("writes money only as well-formed tokens of at most 10,000.00", () => {
    for (const { where, body } of bodies) {
      for (const text of texts(body)) {
        const tokens = text.match(/\{m:[^}]*\}/g) ?? [];
        for (const token of tokens) {
          expect(token, where).toMatch(/^\{m:\d{1,7}\}$/);
          expect(Number(token.slice(3, -1)), where).toBeLessThanOrEqual(1_000_000);
        }
        expect(text.replace(/\{m:\d+\}/g, ""), where).not.toMatch(/\{m:|£|\$|€/);
      }
    }
  });

  it("grades each step's own answer as right", () => {
    for (const { where, body } of bodies) {
      expect(gradeStep(body, rightAnswer(body)).correct, where).toBe(true);
    }
  });

  it("grades every listed misconception and wrong option as wrong", () => {
    for (const { where, body } of bodies) {
      if (body.type === "amount") {
        for (const m of body.misconceptions) {
          expect(gradeStep(body, { kind: "number", value: m.value }).correct, where).toBe(false);
        }
      }
      if (body.type === "choice" || body.type === "predict" || body.type === "reason") {
        for (const option of body.options.filter((o) => o.id !== body.answer)) {
          expect(gradeStep(body, { kind: "option", optionId: option.id }).correct, where).toBe(
            false,
          );
        }
      }
    }
  });
});
