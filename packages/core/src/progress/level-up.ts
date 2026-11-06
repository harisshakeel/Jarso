import { availableWear, type Wear } from "../mascot";
import { progressCopy } from "./copy";

export type LevelUpDecision = "none" | "remember" | "celebrate";

/**
 * What to do with the level the phone last showed (`seen`) and the level now. Nothing stored
 * (first run, a new phone) or a lower level (a data fix) is only remembered: the child is told
 * about a level once, when it rises.
 */
export function levelUpDecision(seen: number | null, level: number): LevelUpDecision {
  if (seen === null || seen > level) return "remember";
  return level > seen ? "celebrate" : "none";
}

/** The newest wear unlocked between levels `from` (exclusive) and `to` (inclusive), or null. */
export function newWear(from: number, to: number): Wear | null {
  const before = new Set(availableWear(from));
  const fresh = availableWear(to).filter((wear) => !before.has(wear));
  return fresh.at(-1) ?? null;
}

/** The level-up celebration's words. Looks unlock by level only, never bought. */
export const levelUpCopy = {
  eyebrow: "Level up",
  title: (level: number, name: string) => progressCopy.levelUp(level, name),
  unlocked: (wearName: string) => `${wearName} unlocked`,
  wearIt: "Wear it",
  later: "Later",
  yay: "Yay!",
};
