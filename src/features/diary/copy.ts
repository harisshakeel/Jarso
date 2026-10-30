import { formatMoney } from "@/lib";

/** What a child sees when a purchase is more than the Spend jar holds. */
export function notEnoughSpendMessage(freeMinor: number, currency: string): string {
  return freeMinor <= 0
    ? "Your Spend jar is empty right now. Record money you got first, or ask a parent."
    : `That's more than you have in Spend (${formatMoney(freeMinor, currency, { showMinor: "nonzero" })}). Record money you got first, or ask a parent.`;
}
