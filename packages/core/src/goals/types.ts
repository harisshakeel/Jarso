import type { GoalProgress } from "./progress";

/** A child's active savings goal. Amounts are minor units. */
export type Goal = {
  id: string;
  name: string;
  emoji: string;
  targetMinor: number;
  /** The child's own estimate per allowance; never changes a handover. */
  planMinor: number | null;
  reachedAt: string | null;
  celebratedAt: string | null;
};

/** The goal with where the child stands, or null without an active goal. */
export type GoalView = { goal: Goal; progress: GoalProgress } | null;

export type GoalInput = {
  name: string;
  emoji: string;
  targetMinor: number;
  planMinor: number | null;
};

export type { GoalProgress };
