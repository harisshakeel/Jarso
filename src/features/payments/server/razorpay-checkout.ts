import "server-only";
import { assertUser } from "@/features/auth/server";
import { razorpayCheckoutKeyId } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { hasPendingSetup } from "./repository";

/**
 * What the save-card page needs to open Razorpay Checkout, or null while Razorpay is off. The
 * key id is public by design; it comes from the server env, never a NEXT_PUBLIC_ var.
 */
export function getRazorpayCheckoutConfig(): { keyId: string } | null {
  const keyId = razorpayCheckoutKeyId();
  return keyId ? { keyId } : null;
}

/**
 * The Checkout config for `orderId`, or null while Razorpay is off or the order is not the
 * signed-in parent's own pending save-card session. Without that check, a parent sent someone
 * else's link would save their card to that person's account.
 */
export async function getRazorpayCheckoutFor(orderId: string): Promise<{ keyId: string } | null> {
  const config = getRazorpayCheckoutConfig();
  if (!config) return null;
  const user = await assertUser();
  const own = await hasPendingSetup(await createClient(), {
    parentId: user.id,
    provider: "razorpay",
    providerRef: orderId,
  });
  return own ? config : null;
}
