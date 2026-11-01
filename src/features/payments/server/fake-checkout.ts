"use server";

import { randomUUID } from "node:crypto";
import { clientEnv } from "@/config";
import { AppError, createAction } from "@/lib";
import { FAKE_METHODS, getPaymentProviderById, type ProviderEvent } from "@/lib/payments";
import { type FakeCheckoutInput, fakeCheckoutSchema } from "../schemas";
import { handleProviderEvent } from "./webhooks";

/** The event the fake provider's webhook would send for this button. */
function eventFor(input: FakeCheckoutInput): ProviderEvent {
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

/**
 * The fake hosted page's buttons (dev and e2e only). Applies the event straight away, as the fake
 * provider's webhook would, and answers with the in-app path to go back to: Cancel and a failed
 * payment go to `cancel`, everything else to `success`. Re-checks the provider, since an action is
 * callable on its own.
 */
export const completeFakeCheckoutAction = createAction(
  () => {
    if (!getPaymentProviderById("fake")) throw new AppError("NOT_FOUND", "Not found");
    return fakeCheckoutSchema(clientEnv.NEXT_PUBLIC_APP_URL);
  },
  async (input): Promise<{ returnTo: string }> => {
    if (input.outcome === "cancel") return { returnTo: input.cancel };
    await handleProviderEvent("fake", eventFor(input));
    return { returnTo: input.outcome === "fail" ? input.cancel : input.success };
  },
);
