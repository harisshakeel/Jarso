import type { AutoChargeCard } from "./types";

/**
 * Interim, until the toggle lets the parent choose (Task 3): the provider a single auto-charge
 * toggle uses. A provider with a saved card first, then one that can charge the family's
 * currency, then the first (which shows why it can't). Undefined with payments off.
 */
export function pickAutoChargeCard(
  cards: readonly AutoChargeCard[] | null,
): AutoChargeCard | undefined {
  if (!cards) return undefined;
  return (
    cards.find((card) => card.cardSaved) ??
    cards.find((card) => card.unavailableReason === null) ??
    cards[0]
  );
}
