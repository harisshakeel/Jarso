import "server-only";
import { razorpayCheckoutKeyId } from "@/lib/payments";

/**
 * What the save-card page needs to open Razorpay Checkout, or null while Razorpay is off. The
 * key id is public by design; it comes from the server env, never a NEXT_PUBLIC_ var.
 */
export function getRazorpayCheckoutConfig(): { keyId: string } | null {
  const keyId = razorpayCheckoutKeyId();
  return keyId ? { keyId } : null;
}
