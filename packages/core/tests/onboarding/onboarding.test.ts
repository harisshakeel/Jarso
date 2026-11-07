import { GOAL_EMOJI } from "@jarso/core/goals";
import {
  isPracticeStep,
  nextStep,
  ONBOARDING_GOALS,
  ONBOARDING_REWARD,
  ONBOARDING_STEPS,
  onboardingCopy,
  onboardingGate,
  onboardingRewardSchema,
  practiceAmounts,
  practiceBuy,
  practiceFill,
  practiceSave,
  startPractice,
  stepNumber,
  suggestedPlan,
} from "@jarso/core/onboarding";
import { BADGE_KEYS } from "@jarso/core/progress";
import { describe, expect, it } from "vitest";

const words = (s: string) => s.trim().split(/\s+/).length;

describe("steps", () => {
  it("steps run meet, spend, save, goal, look and then finish", () => {
    expect(ONBOARDING_STEPS).toEqual(["meet", "spend", "save", "goal", "look"]);
    expect(nextStep("meet")).toBe("spend");
    expect(nextStep("goal")).toBe("look");
    expect(nextStep("look")).toBeNull();
    expect(stepNumber("meet")).toBe(1);
    expect(stepNumber("goal")).toBe(4);
  });

  it("only spend and save are practice steps", () => {
    expect(ONBOARDING_STEPS.filter(isPracticeStep)).toEqual(["spend", "save"]);
  });
});

describe("practice jars", () => {
  it("practice starts at 100 in Spend and nothing in Save", () => {
    expect(startPractice("INR")).toEqual({ mode: "practice", spendMinor: 10000, saveMinor: 0 });
    expect(startPractice("JPY").spendMinor).toBe(100);
    expect(practiceAmounts("GBP")).toEqual({
      startMinor: 10000,
      snackMinor: 2000,
      coinMinor: 1000,
    });
  });

  it("practice jars are marked practice", () => {
    expect(startPractice("INR").mode).toBe("practice");
  });

  it("buying the snack takes 20 off Spend", () => {
    const after = practiceBuy(startPractice("INR"), 2000);
    expect(after.spendMinor).toBe(8000);
    expect(after.saveMinor).toBe(0);
  });

  it("practice never goes below zero", () => {
    const jars = { mode: "practice" as const, spendMinor: 500, saveMinor: 0 };
    expect(practiceBuy(jars, 2000)).toEqual(jars);
    expect(practiceBuy(jars, 0)).toEqual(jars);
    expect(practiceBuy(jars, -5)).toEqual(jars);
    const empty = { mode: "practice" as const, spendMinor: 0, saveMinor: 300 };
    expect(practiceSave(empty, 1000)).toEqual(empty);
    expect(practiceSave(jars, 1000)).toEqual({ mode: "practice", spendMinor: 0, saveMinor: 500 });
    expect(practiceSave(jars, -1)).toEqual(jars);
  });

  it("a coin moves from Spend to Save and the total stays the same", () => {
    const start = practiceBuy(startPractice("INR"), 2000);
    const after = practiceSave(start, 1000);
    expect(after).toEqual({ mode: "practice", spendMinor: 7000, saveMinor: 1000 });
    expect(after.spendMinor + after.saveMinor).toBe(start.spendMinor + start.saveMinor);
  });

  it("practiceFill is 0 when empty and save over the total otherwise", () => {
    expect(practiceFill({ mode: "practice", spendMinor: 0, saveMinor: 0 })).toBe(0);
    expect(practiceFill({ mode: "practice", spendMinor: 300, saveMinor: 100 })).toBe(0.25);
  });
});

describe("suggestedPlan", () => {
  it("suggested plan is a quarter of the allowance in whole units", () => {
    expect(suggestedPlan(12000, "INR")).toBe(3000);
    expect(suggestedPlan(1000, "INR")).toBe(200);
    expect(suggestedPlan(50, "INR")).toBe(100);
    expect(suggestedPlan(10, "JPY")).toBe(2);
    expect(suggestedPlan(null, "INR")).toBeNull();
    expect(suggestedPlan(0, "INR")).toBeNull();
  });

  it("is the Save split when the parent set one", () => {
    expect(suggestedPlan(12000, "INR", 4500)).toBe(4500);
    expect(suggestedPlan(12000, "INR", 12000)).toBe(12000);
    expect(suggestedPlan(12000, "INR", 0)).toBe(3000);
    expect(suggestedPlan(12000, "INR", null)).toBe(3000);
    expect(suggestedPlan(null, "INR", 4500)).toBeNull();
  });
});

describe("onboardingGate", () => {
  it("waits while the local flag is read", () => {
    expect(onboardingGate({ localDone: null, tour: "loading" })).toBe("wait");
  });
  it("skips when done on this phone", () => {
    expect(onboardingGate({ localDone: true, tour: "loading" })).toBe("skip");
  });
  it("waits while the tour loads", () => {
    expect(onboardingGate({ localDone: false, tour: "loading" })).toBe("wait");
  });
  it("skips when the tour can't be read", () => {
    expect(onboardingGate({ localDone: false, tour: "error" })).toBe("skip");
  });
  it("skips when finished", () => {
    expect(onboardingGate({ localDone: false, tour: { finishedAt: "2026-11-06T10:00:00Z" } })).toBe(
      "skip",
    );
  });
  it("shows when not finished", () => {
    expect(onboardingGate({ localDone: false, tour: { finishedAt: null } })).toBe("show");
  });
});

describe("reward", () => {
  it("the reward is 50 Sparks and the Jar Starter badge", () => {
    expect(ONBOARDING_REWARD).toEqual({ sparks: 50, badge: "jar_starter" });
    expect(BADGE_KEYS).toContain("jar_starter");
  });

  it("reward schema keeps a known badge and drops an unknown one", () => {
    expect(onboardingRewardSchema.parse({ sparks: 50, badge: "jar_starter" })).toEqual({
      sparks: 50,
      badge: "jar_starter",
    });
    expect(onboardingRewardSchema.parse({ sparks: 0, badge: "nope" })).toEqual({
      sparks: 0,
      badge: null,
    });
    expect(onboardingRewardSchema.parse({ sparks: 0, badge: null })).toEqual({
      sparks: 0,
      badge: null,
    });
    expect(onboardingRewardSchema.safeParse({ sparks: -1, badge: null }).success).toBe(false);
  });
});

describe("copy", () => {
  const c = onboardingCopy;

  it("copy stays inside the word budget", () => {
    const labels = [
      c.practiceTag,
      c.skip,
      c.next,
      c.meet.go,
      c.spend.hint,
      c.save.coin,
      c.goal.submit,
      c.goal.notNow,
      c.goal.keep,
      c.look.done,
      c.done.badge,
      c.done.go,
      c.replay,
    ];
    for (const label of labels) expect(words(label)).toBeLessThanOrEqual(5);
    for (const label of labels.filter((l) => l !== c.save.coin)) {
      expect(words(label)).toBeLessThanOrEqual(3);
    }
    const bubbles = [
      c.meet.hello("Sam"),
      c.spend.ask("₹20"),
      c.spend.done,
      c.save.ask,
      c.save.done,
    ];
    for (const bubble of bubbles) expect(words(bubble)).toBeLessThanOrEqual(8);
    const headings = [
      c.meet.heading,
      c.spend.heading,
      c.save.heading,
      c.goal.heading,
      c.look.heading,
      c.done.title,
    ];
    for (const heading of headings) expect(words(heading)).toBeLessThanOrEqual(6);
    const all = JSON.stringify(c);
    expect(all).not.toMatch(/lost|fail|wrong|sad/i);
  });

  it("the real-world line names the parent and starts with a capital", () => {
    expect(c.save.realWorld("Mum")).toBe("For real, you hand the cash to Mum.");
    expect(c.save.sub("your parent")).toBe("Your parent keeps it safe for you.");
    expect(c.save.sub("Mum")).toBe("Mum keeps it safe for you.");
  });

  it("says hi with or without a name", () => {
    expect(c.meet.hello("Sam")).toBe("Hi Sam! I'm Jarso.");
    expect(c.meet.hello(null)).toBe("Hi! I'm Jarso.");
  });

  it("the plan and weeks lines read like the mockup", () => {
    expect(c.goal.plan("₹30", "weekly")).toBe("With ₹30 a week");
    expect(c.goal.plan("₹30", "monthly")).toBe("With ₹30 a month");
    expect(c.goal.weeks(1)).toBe("About 1 week");
    expect(c.goal.weeks(15)).toBe("About 15 weeks");
    expect(c.done.sparks(50)).toBe("+50");
    expect(c.stepLabel(2, 5)).toBe("Step 2 of 5");
  });

  it("goal presets use goal emoji", () => {
    expect(ONBOARDING_GOALS).toHaveLength(6);
    for (const g of ONBOARDING_GOALS) {
      expect(GOAL_EMOJI).toContain(g.emoji);
      expect(words(g.name)).toBeLessThanOrEqual(2);
    }
  });
});
