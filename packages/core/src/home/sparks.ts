import type { Progress } from "@jarso/core/progress";
import { homeCopy } from "./copy";

/** Chips after a celebration: Sparks gained (only when they moved) and the day streak. */
export function sparkChips(
  before: Progress | undefined,
  after: Progress | undefined,
): { icon: "zap" | "flame"; label: string }[] {
  if (!after) return [];
  const chips: { icon: "zap" | "flame"; label: string }[] = [];
  if (before && after.sparks > before.sparks) {
    chips.push({ icon: "zap", label: `+${after.sparks - before.sparks}` });
  }
  if (after.streak >= 1) chips.push({ icon: "flame", label: homeCopy.streak(after.streak) });
  return chips;
}
