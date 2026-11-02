/** Emoji a child can pick for a goal: things and activities only, no flags or people. */
export const GOAL_EMOJI = [
  "⚽",
  "🏀",
  "🛹",
  "🚲",
  "🎮",
  "🎧",
  "📱",
  "💻",
  "📷",
  "🎸",
  "🎹",
  "🎨",
  "📚",
  "👟",
  "👕",
  "🎒",
  "⌚",
  "🧸",
  "🎟️",
  "🍕",
  "🎁",
  "🏕️",
  "🐶",
  "⭐",
] as const;

export type GoalEmoji = (typeof GOAL_EMOJI)[number];
