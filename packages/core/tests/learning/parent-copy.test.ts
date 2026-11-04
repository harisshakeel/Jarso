import { parentLearningCopy } from "@jarso/core/learning";
import { describe, expect, it } from "vitest";

describe("parentLearningCopy", () => {
  it("keeps every line", () => {
    expect(parentLearningCopy).toMatchSnapshot();
  });

  it("counts missions and days as the web did", () => {
    expect(parentLearningCopy.missionsDone(2, 7)).toBe("2 of 7 missions done.");
    expect(parentLearningCopy.notYetThisWeek("Ada")).toBe("Ada hasn't learned yet this week.");
    expect(parentLearningCopy.learnedOn(1)).toBe("Learned on 1 day this week.");
    expect(parentLearningCopy.learnedOn(3)).toBe("Learned on 3 days this week.");
    expect(parentLearningCopy.checkIn(4)).toBe("Starting check-in: 4 of 5 known already.");
    expect(parentLearningCopy.stopDone("3 Nov")).toBe("Done on 3 Nov.");
    expect(parentLearningCopy.stopDone(null)).toBe("Done.");
  });
});
