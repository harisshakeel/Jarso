import { guideContextSchema } from "@jarso/core/guide";
import { describe, expect, it } from "vitest";
import { stepChatKey, stepGuideContext } from "@/features/guide/components/step-context";
import type { CurrentStep } from "@/features/learning";

const base: CurrentStep = {
  source: "mission",
  missionKey: "m1",
  stepKey: "one",
  phase: "main",
  wrongTries: 1,
  hintsShown: 1,
  lastTry: { kind: "option", optionId: "b" },
  answered: false,
  answer: null,
};

describe("stepGuideContext", () => {
  it("asks for help with the step on screen, with the last try and hints seen", () => {
    const context = stepGuideContext(base);
    expect(context).toEqual({
      entry: "step",
      source: "mission",
      missionKey: "m1",
      stepKey: "one",
      phase: "main",
      wrongTries: 1,
      hintsShown: 1,
      lastTry: { kind: "option", optionId: "b" },
    });
    expect(guideContextSchema.safeParse(context).success).toBe(true);
  });

  it("asks why once the step is settled, and stays out of the check-in", () => {
    const why = stepGuideContext({
      ...base,
      answered: true,
      lastTry: null,
      answer: { kind: "option", optionId: "a" },
    });
    expect(why).toMatchObject({ entry: "why", answer: { kind: "option", optionId: "a" } });
    expect(guideContextSchema.safeParse(why).success).toBe(true);
    expect(stepGuideContext({ ...base, source: "check-in" })).toBeNull();
    expect(stepGuideContext(null)).toBeNull();
  });

  it("gives each step, and its Why?, a chat of its own", () => {
    expect(stepChatKey(base)).not.toBe(stepChatKey({ ...base, stepKey: "two" }));
    expect(stepChatKey(base)).not.toBe(stepChatKey({ ...base, answered: true }));
    expect(stepChatKey(base)).toBe(stepChatKey({ ...base, wrongTries: 2, hintsShown: 2 }));
  });
});
