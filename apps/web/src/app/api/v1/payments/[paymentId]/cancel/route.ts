import { assertRole } from "@/features/family/server";
import { paymentIdParamSchema } from "@/features/payments";
import { cancelInAppPaymentById } from "@/features/payments/server";
import { json, withApi } from "@/lib/api";

/**
 * For the phone: the parent cancels their own pending card payment from the native sheet
 * (`{ canceled: false }` when there is nothing of theirs to cancel). Parents only.
 */
export const POST = withApi(
  async (_request: Request, ctx: RouteContext<"/api/v1/payments/[paymentId]/cancel">) => {
    await assertRole("parent");
    const paymentId = paymentIdParamSchema.parse((await ctx.params).paymentId);
    return json(await cancelInAppPaymentById(paymentId));
  },
  { bearer: true },
);
