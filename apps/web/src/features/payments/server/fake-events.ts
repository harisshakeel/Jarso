import "server-only";
import { randomUUID } from "node:crypto";
import { FAKE_METHODS, type ProviderEvent } from "@/lib/payments";

/**
 * The event the fake provider's webhook would send for one button on the fake hosted page or the
 * phone's test-card dialog (dev and e2e only). A plain module: a "use server" file may export
 * only actions.
 */
export function fakeEventFor(input: {
  mode: "payment" | "setup";
  ref: string;
  outcome: "pay" | "fail" | "ok" | "decline";
}): ProviderEvent {
  const eventId = randomUUID();
  if (input.mode === "payment") {
    return {
      kind: "payment",
      eventId,
      paymentId: input.ref,
      // The ref the fake adapter gave this checkout in createHostedPayment.
      providerRef: `fake_cs_${input.ref}`,
      ...(input.outcome === "pay"
        ? { status: "succeeded" as const }
        : { status: "failed" as const, failureCode: "declined" as const }),
    };
  }
  const works = input.outcome === "ok";
  return {
    kind: "setup",
    eventId,
    setupId: input.ref,
    methodRef: works ? FAKE_METHODS.ok : FAKE_METHODS.decline,
    card: { brand: "visa", last4: works ? "4242" : "0341" },
  };
}
