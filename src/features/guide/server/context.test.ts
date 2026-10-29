import { describe, expect, it } from "vitest";
import { missions, topics } from "@/features/learning/server";
import { buildContext } from "./context";

const mission = missions[0];
const step = mission?.steps.find((s) => s.type === "choice");
if (!mission || !step || step.type !== "choice") throw new Error("mission 1 needs a choice step");

describe("buildContext", () => {
  it("describes an exercise from reviewed content and forbids the answer before two tries", () => {
    const context = buildContext(
      {
        entry: "step",
        source: "mission",
        missionKey: mission.key,
        stepKey: step.key,
        phase: "main",
        wrongTries: 1,
      },
      "GBP",
    );
    expect(context.entry).toBe("step");
    expect(context.contextKey).toBe(`step:mission:${mission.key}:${step.key}:main`);
    expect(context.text).toContain("Tries so far: 1.");
    expect(context.text).toContain("Do not give the answer");
    expect(context.text).toMatch(/£\d/);
    expect(context.text).not.toMatch(/\{m:/);
  });

  it("allows explaining the answer after two tries", () => {
    const context = buildContext(
      {
        entry: "step",
        source: "mission",
        missionKey: mission.key,
        stepKey: step.key,
        phase: "main",
        wrongTries: 2,
      },
      "USD",
    );
    expect(context.text).toContain("You may explain the right answer");
    expect(context.text).toContain("US$");
  });

  it("includes the child's answer for Why?", () => {
    const wrong = step.options.find((o) => o.id !== step.answer);
    const context = buildContext(
      {
        entry: "why",
        source: "mission",
        missionKey: mission.key,
        stepKey: step.key,
        phase: "main",
        answer: { kind: "option", optionId: wrong?.id ?? "x" },
      },
      "GBP",
    );
    expect(context.text).toContain("The child's answer:");
    expect(context.label).toMatch(/^Why\?/);
  });

  it("covers topic, home and practice entries", () => {
    const topic = topics[0];
    if (!topic) throw new Error("no topic");
    expect(buildContext({ entry: "topic", topicKey: topic.key }, "GBP").contextKey).toBe(
      `topic:${topic.key}`,
    );
    expect(buildContext({ entry: "home" }, "GBP").label).toBe("Asked from Home");
    const practice = buildContext(
      {
        entry: "step",
        source: "topic",
        missionKey: null,
        stepKey: topic.practice.key,
        phase: "main",
        wrongTries: 0,
      },
      "GBP",
    );
    expect(practice.label).toContain(topic.title);
  });

  it("refuses unknown keys, so nothing invented reaches the guide", () => {
    expect(() =>
      buildContext(
        {
          entry: "step",
          source: "mission",
          missionKey: mission.key,
          stepKey: "nope",
          phase: "main",
          wrongTries: 0,
        },
        "GBP",
      ),
    ).toThrow(/couldn't find/);
    expect(() =>
      buildContext(
        {
          entry: "step",
          source: "practice",
          missionKey: null,
          stepKey: "nope",
          phase: "main",
          wrongTries: 0,
        },
        "GBP",
      ),
    ).toThrow(/couldn't find/);
  });
});
