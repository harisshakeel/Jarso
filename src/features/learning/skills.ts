// The learning catalogue: five FR06 topics and the skills each one teaches. Keys are stable:
// progress rows in the database are keyed by them, so rename the label, never the key.

export const topicKeys = [
  "spending",
  "splitting",
  "saving-goal",
  "tradeoffs",
  "changing-plans",
] as const;
export type TopicKey = (typeof topicKeys)[number];

export const skillKeys = [
  "balance.afford",
  "balance.running_total",
  "split.amounts",
  "split.share",
  "goal.weeks_needed",
  "goal.progress",
  "tradeoff.give_up",
  "tradeoff.need_want",
  "plan.adjust",
] as const;
export type SkillKey = (typeof skillKeys)[number];

export type Skill = { key: SkillKey; label: string; topic: TopicKey };

/** In topic order; the learning page lists skills this way. */
export const skills: readonly Skill[] = [
  { key: "balance.afford", label: "Knowing what you can afford", topic: "spending" },
  { key: "balance.running_total", label: "Keeping a running total", topic: "spending" },
  { key: "split.amounts", label: "Splitting an amount", topic: "splitting" },
  { key: "split.share", label: "Thinking in shares", topic: "splitting" },
  { key: "goal.weeks_needed", label: "Working out how long", topic: "saving-goal" },
  { key: "goal.progress", label: "Tracking progress", topic: "saving-goal" },
  { key: "tradeoff.give_up", label: "Seeing what you give up", topic: "tradeoffs" },
  { key: "tradeoff.need_want", label: "Needs and wants", topic: "tradeoffs" },
  { key: "plan.adjust", label: "Changing a plan", topic: "changing-plans" },
];

export type MissionTopic = TopicKey | "mixed";

export const topicTitles: Record<MissionTopic, string> = {
  mixed: "Mixed review",
  spending: "Spending within your balance",
  splitting: "Splitting an allowance",
  "saving-goal": "Saving toward a goal",
  tradeoffs: "Understanding tradeoffs",
  "changing-plans": "Changing a plan",
};

export function skillOf(key: string): Skill | undefined {
  return skills.find((skill) => skill.key === key);
}

/**
 * FR10 levels: 0 not started, 1 Started (seen in a mission), 2 Practised (right in a mission),
 * 3 Got it (right without hints in a review with a new example).
 */
export const skillLevelLabels = ["Not started", "Started", "Practised", "Got it"] as const;
export type SkillLevel = 0 | 1 | 2 | 3;
