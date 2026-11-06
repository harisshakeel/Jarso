import { z } from "zod";

export const JARSO_MOODS = ["happy", "cheer", "wow", "think", "wave", "sleepy"] as const;
export type JarsoMood = (typeof JARSO_MOODS)[number];

export const LID_COLORS = ["cyan", "grape", "blush", "green", "ink"] as const;
export type LidColor = (typeof LID_COLORS)[number];

export type Wear = "none" | "cap" | "shades" | "headphones" | "crown";

/** Insertion order is the display order. */
export const WEAR_UNLOCK_LEVEL: Record<Wear, number> = {
  none: 1,
  cap: 1,
  shades: 3,
  headphones: 4,
  crown: 5,
};

export type JarsoLook = { lid: LidColor; wear: Wear };

export const DEFAULT_LOOK: JarsoLook = { lid: "cyan", wear: "none" };

export function wearUnlocked(wear: Wear, level: number): boolean {
  return level >= WEAR_UNLOCK_LEVEL[wear];
}

export function availableWear(level: number): Wear[] {
  return (Object.keys(WEAR_UNLOCK_LEVEL) as Wear[]).filter((w) => wearUnlocked(w, level));
}

const lookSchema = z.object({
  lid: z.enum(LID_COLORS).catch(DEFAULT_LOOK.lid),
  wear: z.enum(Object.keys(WEAR_UNLOCK_LEVEL) as [Wear, ...Wear[]]).catch(DEFAULT_LOOK.wear),
});

export function parseLook(value: unknown): JarsoLook {
  const parsed = lookSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_LOOK };
}

/** How full the jar looks, 0..1. */
export function jarsoFill(input: {
  saveMinor: number;
  spendMinor: number;
  goalTargetMinor: number | null;
}): number {
  const { saveMinor, spendMinor, goalTargetMinor } = input;
  const total = spendMinor + saveMinor;
  const ratio =
    goalTargetMinor !== null && goalTargetMinor > 0
      ? saveMinor / goalTargetMinor
      : goalTargetMinor === null && total > 0
        ? saveMinor / total
        : 0;
  return Math.min(1, Math.max(0, ratio));
}

export type JarsoMoment =
  | "rest"
  | "logged"
  | "saved"
  | "milestone"
  | "goalReached"
  | "levelUp"
  | "answerRight"
  | "answerWrong"
  | "waiting"
  | "empty"
  | "greeting";

const MOMENT_MOOD: Record<JarsoMoment, JarsoMood> = {
  rest: "happy",
  logged: "cheer",
  saved: "cheer",
  milestone: "cheer",
  goalReached: "cheer",
  levelUp: "wow",
  answerRight: "cheer",
  answerWrong: "think",
  waiting: "think",
  empty: "sleepy",
  greeting: "wave",
};

export function moodFor(moment: JarsoMoment): JarsoMood {
  return MOMENT_MOOD[moment];
}
