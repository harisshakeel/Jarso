import { coachIds } from "@jarso/core/learning";
import { buddyName, saveTourSchema, tourSteps } from "@jarso/core/tour";
import { describe, expect, it } from "vitest";

const words = { name: "Sam", buddy: "Pip" };

describe("tourSteps", () => {
  it("starts with picking a buddy and ends with the finish, 13 steps in all", () => {
    expect(tourSteps).toHaveLength(13);
    expect(tourSteps[0]?.kind).toBe("pick");
    expect(tourSteps.at(-1)?.kind).toBe("finish");
    expect(new Set(tourSteps.map((step) => step.id)).size).toBe(tourSteps.length);
  });

  it("visits every tab once, and only Jarso's tab is spoken by Jarso", () => {
    const taps = tourSteps.flatMap((step) => (step.kind === "tap" ? [step] : []));
    expect(taps.map((step) => step.tab)).toEqual(["diary", "learn", "jarso", "inbox"]);
    expect(taps.filter((step) => step.arrive.speaker === "jarso").map((step) => step.tab)).toEqual([
      "jarso",
    ]);
  });

  it("keeps every line short and uses the child's and buddy's names", () => {
    for (const step of tourSteps) {
      const lines =
        step.kind === "tap" ? [step.say(words), step.arrive.say(words)] : [step.say(words)];
      for (const line of lines) expect(line.split(" ").length).toBeLessThanOrEqual(16);
    }
    expect(tourSteps[0]?.say(words)).toContain("Sam");
    expect(tourSteps[1]?.say(words)).toContain("I'm Pip");
  });
});

describe("buddyName", () => {
  it("names the buddy, or says 'your buddy' before one is picked", () => {
    expect(buddyName("zuzu")).toBe("Zuzu");
    expect(buddyName(null)).toBe("your buddy");
  });
});

describe("saveTourSchema", () => {
  it("takes one of the four kids and/or finished, and nothing else", () => {
    for (const buddy of coachIds) expect(saveTourSchema.safeParse({ buddy }).success).toBe(true);
    expect(saveTourSchema.safeParse({ finished: true }).success).toBe(true);
    expect(saveTourSchema.safeParse({ buddy: "rex" }).success).toBe(false);
    expect(saveTourSchema.safeParse({}).success).toBe(false);
  });
});
