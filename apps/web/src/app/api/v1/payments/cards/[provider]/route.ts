import { assertRole } from "@/features/family/server";
import { paymentProviderSchema } from "@/features/payments";
import { removeSavedCard } from "@/features/payments/server";
import { json, withApi } from "@/lib/api";

/**
 * For the phone: removes the parent's saved card at one provider (a parent has at most one card
 * per provider, so the provider names it) and turns off the auto charges that use it. Parents only.
 */
export const DELETE = withApi(
  async (_request: Request, ctx: RouteContext<"/api/v1/payments/cards/[provider]">) => {
    await assertRole("parent");
    const provider = paymentProviderSchema.parse((await ctx.params).provider);
    await removeSavedCard({ provider });
    return json({ removed: true });
  },
  { bearer: true },
);
