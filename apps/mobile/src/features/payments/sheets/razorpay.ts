import RazorpayCheckout from "react-native-razorpay";
import type { RazorpaySheet, SheetOutcome } from "./types";

/** Cards only, as on the web: Jarso's hosted flows never offered UPI, wallets or net banking. */
const CARD_ONLY = {
  card: true,
  netbanking: false,
  upi: false,
  wallet: false,
  emi: false,
  paylater: false,
};

/**
 * Opens Razorpay Checkout on the API's order. Saving a card adds the customer and `recurring`,
 * with the contact the parent typed (sent to Razorpay, never kept). The signature in the result
 * is not checked here: the webhook is the truth. A dismiss or failure is "closed".
 */
export async function presentRazorpaySheet(sheet: RazorpaySheet): Promise<SheetOutcome> {
  const setup =
    sheet.mode === "setup"
      ? {
          ...(sheet.customerId ? { customer_id: sheet.customerId } : {}),
          recurring: "1" as const,
          ...(sheet.prefill ? { prefill: sheet.prefill } : {}),
        }
      : {};
  try {
    await RazorpayCheckout.open({
      key: sheet.keyId,
      order_id: sheet.orderId,
      amount: sheet.amountMinor,
      currency: sheet.currency,
      name: "Jarso",
      description: sheet.description,
      method: CARD_ONLY,
      ...setup,
    });
    return "completed";
  } catch {
    return "closed";
  }
}
