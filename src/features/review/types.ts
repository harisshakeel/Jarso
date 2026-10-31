import type { AnswerableStep, SkillKey, SkillLevel } from "@/features/learning";

/** One week's money, Monday to Sunday, in minor units. `savedMinor` can be negative. */
export type WeekMoney = {
  weekStart: string;
  weekEnd: string;
  /** Allowances, gifts and extra money that reached the jars. */
  receivedMinor: number;
  /** Purchases, less any undone. */
  spentMinor: number;
  /** Net moved into Save this week, plus the Save half of handovers. */
  savedMinor: number;
  /** Allowance due but not handed over yet. */
  stillDueMinor: number;
};

export type GoalLine =
  | { kind: "none" }
  | { kind: "reached"; name: string; emoji: string }
  | {
      kind: "progress";
      name: string;
      emoji: string;
      countedMinor: number;
      targetMinor: number;
      remainingMinor: number;
      paymentsLeft: number | null;
    };

/** One decision this week and what it did to the plan (FR11), in the child's words. */
export type DecisionLine = { what: string; effect: string };

export type SkillNote = { skillKey: SkillKey; label: string; level: SkillLevel };

/** Everything the "Your week" card shows. Built in code; never from the model. */
export type WeeklyReview = {
  money: WeekMoney;
  goal: GoalLine;
  decision: DecisionLine | null;
  /** A skill that moved up this week, if any. */
  understood: SkillNote | null;
  /** A learned skill worth another look: the lowest level with the soonest review. */
  practise: SkillNote | null;
  /** A fresh question on a learned skill, from the review pool. */
  question: AnswerableStep | null;
};
