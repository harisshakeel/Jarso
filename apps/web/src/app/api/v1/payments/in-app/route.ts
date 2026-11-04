import { assertRole } from "@/features/family/server";
import { inAppPaymentSchema } from "@/features/payments";
import { startInAppPayment } from "@/features/payments/server";
import { json, parseBody, withApi } from "@/lib/api";

/**
 * For the phone: starts (or reopens) paying one item by card in the native sheet and returns the
 * sheet's params. Never reports success: the phone polls `GET /payments/:id` and only the
 * provider's webhook succeeds a payment. Parents only.
 */
export const POST = withApi(
  async (request: Request) => {
    await assertRole("parent");
    const input = await parseBody(request, inAppPaymentSchema);
    return json(await startInAppPayment(input));
  },
  { bearer: true },
);
