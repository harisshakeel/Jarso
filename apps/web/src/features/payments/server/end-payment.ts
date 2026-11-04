import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib";
import { getPaymentProviderById, type PaymentProviderId } from "@/lib/payments";
import type { Database } from "@/types";
import { cancelPayment, expirePayment } from "./repository";

/**
 * Ends a live payment as expired or canceled. An in-app one also has its PaymentIntent cancelled
 * at the provider, best effort, so it can no longer succeed: if it already did, the cancel fails
 * and the success still posts through the webhook (or is marked unapplied). Never posts twice:
 * statuses only move forward. A provider error is logged by ids only and not rethrown.
 */
export async function endLivePayment(
  admin: SupabaseClient<Database>,
  live: { id: string; provider: PaymentProviderId; providerRef: string | null; inApp: boolean },
  status: "expired" | "canceled",
): Promise<void> {
  if (status === "expired") await expirePayment(admin, live.id);
  else await cancelPayment(admin, live.id);
  if (!live.inApp || !live.providerRef) return;
  const provider = getPaymentProviderById(live.provider);
  if (!provider) return;
  try {
    await provider.cancelInAppPayment(live.providerRef);
  } catch {
    logger.error("Could not cancel the in-app payment at the provider", {
      paymentId: live.id,
      provider: live.provider,
    });
  }
}
