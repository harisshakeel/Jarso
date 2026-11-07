import { minorDigits } from "@jarso/core/lib";
import { prefillSplit } from "./describe";
import type { Split } from "./types";

/**
 * The planned Spend/Save split of an allowance (ADR 0019). Only the Save part is stored; Spend is
 * always the rest, so the two parts add up to the amount exactly.
 */

/** The shares the editor offers, in percent of the amount to Save. 0 is "All Spend". */
export const SAVE_SHARES = [0, 10, 25, 50] as const;

/** A new allowance starts with a quarter to Save: a head start toward a goal. */
export const DEFAULT_SAVE_SHARE = 25;

/**
 * Save for a share of the amount, rounded down to a whole currency unit (whole coins and notes at
 * a cash handover); Spend gets the rest. Under one whole unit, Save is 0.
 */
export function saveForShare(amountMinor: number, share: number, currency: string): number {
  if (amountMinor <= 0 || share <= 0) return 0;
  if (share >= 100) return amountMinor;
  const unit = 10 ** minorDigits(currency);
  // BigInt keeps the product exact for any safe-integer amount.
  const raw = Number((BigInt(amountMinor) * BigInt(Math.round(share))) / BigInt(100));
  return Math.floor(raw / unit) * unit;
}

/** The offered share that gives exactly this Save for this amount, or null (a typed Save). */
export function shareOfSave(
  amountMinor: number,
  saveMinor: number,
  currency: string,
): number | null {
  // Smallest first: under one whole unit every share gives 0, which reads as "All Spend".
  return (
    SAVE_SHARES.find((share) => saveForShare(amountMinor, share, currency) === saveMinor) ?? null
  );
}

/** The planned split: Save clamped to 0..amount, Spend the rest. */
export function scheduleSplit(amountMinor: number, saveMinor: number): Split {
  const saved = Math.min(Math.max(saveMinor, 0), Math.max(amountMinor, 0));
  return { cash: amountMinor - saved, saved };
}

/** Where a handover prefill came from: the allowance's plan, the last handover, or neither. */
export type PrefillSource = "plan" | "last" | "none";

/**
 * Handover prefill: the due item's planned split when it has one, else the share of the last
 * handover (`prefillSplit`), else all Spend. The parent can still change both numbers.
 */
export function handoverPrefill(
  item: { amountMinor: number; plannedSaveMinor: number | null },
  last: Split | null,
): { split: Split; from: PrefillSource } {
  // typeof rather than `!== null`, so an item built without the field reads as no plan.
  if (typeof item.plannedSaveMinor === "number") {
    return { split: scheduleSplit(item.amountMinor, item.plannedSaveMinor), from: "plan" };
  }
  return { split: prefillSplit(item.amountMinor, last), from: last ? "last" : "none" };
}
