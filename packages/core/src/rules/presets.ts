import { minorDigits } from "@jarso/core/lib";
import type { JarMovesMode, MoneyRule } from "./types";

/**
 * The parent's three freedom presets in onboarding ("When Sam saves or uses savings"). Each is a
 * set of writes onto a new child's defaults (every rule off, jar moves `ask`); fine-tuning stays
 * on the Rules page.
 * - `ask`: "Ask me every time". The defaults: nothing to write.
 * - `small`: "Small ones: just tell me". Take-outs up to the cap are approved at once (the cash
 *   still waits for the parent's handover) and put-ins up to the cap post at once. Over the cap,
 *   the child still asks.
 * - `free`: "Sam decides". Jar moves are recorded at once and the parent gets a note.
 */
export const FREEDOM_PRESETS = ["ask", "small", "free"] as const;
export type FreedomPreset = (typeof FREEDOM_PRESETS)[number];

export type FreedomWrites = {
  /** Jar moves approval to set, or null to leave the default (`ask`). */
  jarMoves: JarMovesMode | null;
  /** Money rules to set. */
  rules: MoneyRule[];
};

/** Whole-unit caps where 5 is too small to matter. */
const SMALL_CAP: Record<string, number> = { INR: 50, JPY: 500 };
const DEFAULT_SMALL_CAP = 5;

/** The "small ones" cap in minor units: 50 rupees, 500 yen, else 5 units. */
export function smallCapMinor(currency: string): number {
  return (SMALL_CAP[currency] ?? DEFAULT_SMALL_CAP) * 10 ** minorDigits(currency);
}

/** What choosing `preset` writes for a new child, with `capMinor` for "small ones". */
export function freedomWrites(preset: FreedomPreset, capMinor: number): FreedomWrites {
  switch (preset) {
    case "ask":
      return { jarMoves: null, rules: [] };
    case "small":
      return {
        jarMoves: null,
        rules: [
          { kind: "withdrawal_auto_approve", period: "item", amountMinor: capMinor },
          { kind: "deposit_auto_confirm", period: "item", amountMinor: capMinor },
        ],
      };
    case "free":
      return { jarMoves: "notify", rules: [] };
  }
}
