import { type InAppSheet, paymentCopy } from "@jarso/core/payments";
import { AppError } from "@/lib";
import { presentRazorpaySheet } from "./razorpay";
import { presentStripeSheet } from "./stripe";
import type { FakeSheet, SheetOutcome } from "./types";

export { useFakeSheet } from "./fake-sheet";
export type { FakeSheet, SheetOutcome } from "./types";

/**
 * Opens the native sheet the API asked for. The fake provider's test card is a dialog the screen
 * renders (`onFake`), in dev builds only; a release build refuses it.
 */
export async function presentSheet(
  sheet: InAppSheet,
  opts: { onFake: (sheet: FakeSheet) => Promise<SheetOutcome> },
): Promise<SheetOutcome> {
  switch (sheet.provider) {
    case "stripe":
      return presentStripeSheet(sheet);
    case "razorpay":
      return presentRazorpaySheet(sheet);
    case "fake":
      if (!__DEV__) throw new AppError("UNAVAILABLE", paymentCopy.cardFormFailed);
      return opts.onFake(sheet);
  }
}
