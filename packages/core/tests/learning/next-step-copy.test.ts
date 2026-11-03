import { coachLine, coachLines, describeStep, NEXT_STEP_EYEBROW } from "@jarso/core/learning";
import { describe, expect, it } from "vitest";

describe("describeStep", () => {
  it("names each next step in the words Home always used", () => {
    expect(describeStep({ kind: "resume", missionKey: "m", title: "Needs and wants" })).toEqual({
      title: "Halfway there. Keep going.",
      body: 'Pick up "Needs and wants" where you left off.',
      cta: "Continue",
    });
    expect(describeStep({ kind: "check-in" }).cta).toBe("Start");
    expect(describeStep({ kind: "comeback" }).title).toBe("Welcome back. One quick question?");
    expect(describeStep({ kind: "mission", missionKey: "m", title: "Jars", day: 2 })).toEqual({
      title: "Day 2. Jars",
      body: "Two or three minutes. Hints are free.",
      cta: "Start mission",
    });
    expect(describeStep({ kind: "done" }).cta).toBe("See your skills");
    expect(NEXT_STEP_EYEBROW).toBe("Next step");
  });

  it("counts skills ready for practice", () => {
    expect(describeStep({ kind: "practice", count: 1 }).body).toBe(
      "One skill is ready for a quick review.",
    );
    expect(describeStep({ kind: "practice", count: 3 }).body).toBe(
      "3 skills are ready for a quick review.",
    );
  });
});

describe("coach moment lines", () => {
  it("keeps every coach's line for each moment", () => {
    expect(coachLine("pip", "nextStep")).toBe("Shall we?");
    expect(coachLines.oops.nell).toBe("That didn't load. Let's try again.");
  });
});
