/** Sparks per action. Mirrored by the progress_award SQL; keep in sync. */
export const SPARKS = {
  log: 10,
  checkin: 5,
  step: 15,
  save: 20,
  goalMilestone: 25,
  goalReached: 100,
} as const;

/** Most awards per family-local day. */
export const DAILY_CAPS = { log: 3, checkin: 1, step: 20, save: 2 } as const;

export const GOAL_REACHED_COOLDOWN_DAYS = 7;

/** Index is level - 1; value is the Sparks needed for that level. */
export const LEVEL_THRESHOLDS: readonly number[] = [
  0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200,
];

export const LEVEL_NAMES: readonly string[] = [
  "Jar Starter",
  "Coin Spotter",
  "Smart Saver",
  "Coin Keeper",
  "Money Maker",
  "Budget Boss",
  "Goal Getter",
  "Money Mind",
  "Jar Hero",
  "Jar Legend",
];

/** Level 1 to 10. Negative or NaN counts as 0 Sparks. */
export function levelFor(sparks: number): number {
  const s = Number.isFinite(sparks) && sparks > 0 ? sparks : 0;
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (s >= (LEVEL_THRESHOLDS[i] ?? 0)) level = i + 1;
  }
  return level;
}

export function levelProgress(sparks: number): {
  level: number;
  name: string;
  nextAt: number | null;
  toNext: number | null;
  share: number;
} {
  const s = Number.isFinite(sparks) && sparks > 0 ? sparks : 0;
  const level = levelFor(s);
  const name = LEVEL_NAMES[level - 1] ?? "";
  const nextAt = LEVEL_THRESHOLDS[level] ?? null;
  if (nextAt === null) return { level, name, nextAt: null, toNext: null, share: 1 };
  const from = LEVEL_THRESHOLDS[level - 1] ?? 0;
  return { level, name, nextAt, toNext: nextAt - s, share: (s - from) / (nextAt - from) };
}
