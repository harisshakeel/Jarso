import { formatMoney } from "@/lib";

/** What a child sees when a purchase is more than the Spend jar holds. */
export function notEnoughSpendMessage(freeMinor: number, currency: string): string {
  return freeMinor <= 0
    ? "Your Spend jar is empty right now. Record money you got first, or ask a parent."
    : `That's more than you have in Spend (${formatMoney(freeMinor, currency, { showMinor: "nonzero" })}). Record money you got first, or ask a parent.`;
}

export const notEnoughSaveMessage =
  "Some of your Save is waiting to come out, so this can't be undone right now.";
export const notEnoughSaveToFixMessage =
  "Some of your Save is waiting to come out, so this can't be lowered right now.";
export const notFixableMessage = "This one can't be fixed any more.";
export const unchangedMessage = "Nothing changed.";
export const notEnoughSpendToUndoMessage =
  "You've spent some of this already, so it can't be undone.";

/** A fix to a purchase that needs more Spend than there is. `freeMinor` is the free Spend right now. */
export function notEnoughSpendToRaiseMessage(
  currentMinor: number,
  freeMinor: number,
  currency: string,
): string {
  return `That's more than you have in Spend. The most it can be is ${formatMoney(currentMinor + freeMinor, currency, { showMinor: "nonzero" })}.`;
}

/** A fix that lowers money received into Spend after some of it was spent. */
export function notEnoughSpendToLowerMessage(
  currentMinor: number,
  freeMinor: number,
  currency: string,
): string {
  return `You've spent some of this already. The least it can be is ${formatMoney(Math.max(currentMinor - freeMinor, 0), currency, { showMinor: "nonzero" })}.`;
}
