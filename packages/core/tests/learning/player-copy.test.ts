import { describe, expect, it } from "vitest";
import { inputCopy, learnCopy, playerCopy, roadmapCopy } from "../../src/learning";

// The words the web's player and Learn pages showed before they moved here, verbatim.
describe("learning copy", () => {
  it("keeps the player's lines", () => {
    expect(playerCopy.saveFailed).toBe(
      "We couldn't save that. Check your connection and try again.",
    );
    expect(playerCopy.replayPosition(1, 2)).toBe("One more look: 1 of 2");
    expect(playerCopy.stepPosition(3, 7)).toBe("Step 3 of 7");
    expect(playerCopy.questionPosition(2, 5)).toBe("Question 2 of 5");
    expect(playerCopy.answerLine("£6")).toBe("The answer: £6.");
    expect(playerCopy.progressLabel.topic).toBe("Practice progress");
    expect(inputCopy.splitLabel).toBe("Move the slider to choose how much goes to Save");
  });

  it("keeps the road and the pages' lines", () => {
    expect(roadmapCopy.stopName(2, "Splitting")).toBe("Day 2 · Splitting");
    expect(roadmapCopy.locked("Day 2 · Splitting")).toBe("Day 2 · Splitting, locked");
    expect(`${roadmapCopy.tapGold(3)}${roadmapCopy.unlocksAfter}`).toBe(
      "Tap the gold stop to play Day 3. Unlocks after the mission before it.",
    );
    expect(learnCopy.mission.eyebrow(1, "Spending")).toBe("Day 1 · Spending");
    expect(learnCopy.mission.body("Check before you buy.")).toBe(
      "Check before you buy. About three minutes. Hints are free.",
    );
    expect(learnCopy.topic.backTo("What's in Spend?")).toBe('Back to "What\'s in Spend?"');
  });
});

describe("phone split stepper copy", () => {
  it("talks about the − and + buttons, not a slider", () => {
    expect(inputCopy.splitLabelStepper).toBe("Tap − and + to choose how much goes to Save");
    expect(inputCopy.saveLess).toBe("Less to Save");
    expect(inputCopy.saveMore).toBe("More to Save");
  });
});
