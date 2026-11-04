import type { InAppSheet } from "@jarso/core/payments";

/**
 * How a native sheet ended. "completed": the sheet says it finished, which is never shown as
 * paid (only the webhook decides; the phone reads the status back). "closed": dismissed, or a
 * decline the parent can retry, so the payment stays pending.
 */
export type SheetOutcome = "completed" | "closed";

export type StripeSheet = Extract<InAppSheet, { provider: "stripe" }>;
export type RazorpaySheet = Extract<InAppSheet, { provider: "razorpay" }>;
export type FakeSheet = Extract<InAppSheet, { provider: "fake" }>;
