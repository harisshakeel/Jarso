import {
  goalCopy,
  PLAN_MESSAGES,
  PREDICT_LABEL,
  PREDICT_QUESTION,
  previewLine,
} from "@jarso/core/goals";
import { describe, expect, it } from "vitest";

const base = { targetMinor: 4500, savedMinor: 2600, planMinor: 400, currency: "GBP" };

describe("previewLine", () => {
  it("says when the goal is already saved for", () => {
    expect(previewLine({ ...base, savedMinor: 4500 })).toBe(
      "You've already saved enough for this.",
    );
  });

  it("nudges for a plan without one", () => {
    expect(previewLine({ ...base, planMinor: null })).toBe(
      "Set how much you'll save each time to see how long it'll take",
    );
  });

  it("counts the allowances left", () => {
    expect(previewLine({ ...base, savedMinor: 3300 })).toBe("About 3 more allowances");
    expect(previewLine({ ...base, savedMinor: 4200 })).toBe("About 1 more allowance");
  });
});

describe("goal copy", () => {
  it("keeps the plan refusals", () => {
    expect(PLAN_MESSAGES.plan_over_allowance).toBe(
      "That's more than your allowance. Try a smaller amount.",
    );
    expect(PLAN_MESSAGES.plan_over_target).toBe(
      "That's more than your goal costs. Try a smaller amount.",
    );
  });

  it("labels the predict step", () => {
    expect(PREDICT_LABEL).toEqual({
      further: "Further off",
      same: "Stays the same",
      closer: "Closer",
    });
    expect(PREDICT_QUESTION.take_out).toBe("If you take this out, what happens to your goal?");
    expect(PREDICT_QUESTION.change_plan).toBe("With this plan, what happens to your goal?");
  });

  it("formats the composed lines", () => {
    expect(goalCopy.sheet.planHint("£5")).toBe("Up to £5 from each allowance.");
    expect(goalCopy.card.title("⚽", "Boots", "£45")).toBe("⚽ Boots, £45.");
    expect(goalCopy.staircase.amounts("£26", "£19", "£4")).toBe(
      "£26 saved · £19 to go · £4 each allowance",
    );
    expect(goalCopy.staircase.amounts("£26", "£19", null)).toBe("£26 saved · £19 to go");
    expect(goalCopy.home.reachedTitle("⚽", "Boots")).toBe("Saved up. ⚽ Boots.");
  });
});
