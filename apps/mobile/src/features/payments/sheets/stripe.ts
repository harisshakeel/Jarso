import { paymentCopy } from "@jarso/core/payments";
import { initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";
import { AppError } from "@/lib";
import type { SheetOutcome, StripeSheet } from "./types";

/** Where Stripe sends the parent back after a bank's 3-D Secure page (the app's scheme). */
const RETURN_URL = "jarso://stripe-redirect";

/**
 * Opens Stripe's PaymentSheet on the API's PaymentIntent or SetupIntent. The publishable key
 * comes from the API, never from the bundle. Any error inside the sheet (closed, or a decline
 * the parent could retry) is "closed": the payment stays pending and the webhook decides.
 */
export async function presentStripeSheet(sheet: StripeSheet): Promise<SheetOutcome> {
  const intent =
    sheet.mode === "payment"
      ? { paymentIntentClientSecret: sheet.clientSecret }
      : { setupIntentClientSecret: sheet.clientSecret };
  let failed: { code: string } | null = null;
  try {
    await initStripe({ publishableKey: sheet.publishableKey, urlScheme: "jarso" });
    const { error } = await initPaymentSheet({
      merchantDisplayName: "Jarso",
      customerId: sheet.customerId,
      customerEphemeralKeySecret: sheet.ephemeralKey,
      ...intent,
      returnURL: RETURN_URL,
      allowsDelayedPaymentMethods: false,
    });
    if (error) failed = { code: String(error.code) };
  } catch {
    failed = { code: "init" };
  }
  // Only the error code goes along: the message can echo the intent, never its secret. Not
  // UNAVAILABLE: that reads as the offline line, and this message is the one to show.
  if (failed) throw new AppError("INTERNAL", paymentCopy.cardFormFailed, { cause: failed });
  const { error } = await presentPaymentSheet();
  return error ? "closed" : "completed";
}
