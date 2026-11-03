export type CardPaymentSlotProps = {
  kind: "allowance" | "gift";
  id: string;
  childId: string;
  amountMinor: number;
  currency: string;
  /** The handover form's current cash/saved split; the server prefills when absent. */
  split?: { spendMinor: number; saveMinor: number };
};

/** Paying a handover by card. Renders nothing until plan 4 fills it. */
export function CardPaymentSlot(_props: CardPaymentSlotProps): null {
  return null;
}
