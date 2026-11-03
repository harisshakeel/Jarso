"use server";

import { fakeCheckoutSchema } from "@jarso/core/payments";
import { clientEnv } from "@/config";
import { AppError, createAction } from "@/lib";
import { getPaymentProviderById } from "@/lib/payments";
import { fakeEventFor } from "./fake-events";
import { handleProviderEvent } from "./webhooks";

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
    const { mode, ref, outcome } = input;
    await handleProviderEvent("fake", fakeEventFor({ mode, ref, outcome }));
    return { returnTo: input.outcome === "fail" ? input.cancel : input.success };
  },
);
