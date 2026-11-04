import { assertRole } from "@/features/family/server";
import { paymentIdParamSchema } from "@/features/payments";
import { getPaymentStatus } from "@/features/payments/server";
import { json, withApi } from "@/lib/api";

/**
 * For the phone: a card payment's status, polled after the native sheet closes until `final`.
 * Another family's payment is a 404 (RLS hides it). Parents only.
 */
export const GET = withApi(
  async (_request: Request, ctx: RouteContext<"/api/v1/payments/[paymentId]">) => {
    await assertRole("parent");
    const paymentId = paymentIdParamSchema.parse((await ctx.params).paymentId);
    return json(await getPaymentStatus(paymentId));
  },
  { bearer: true },
);
