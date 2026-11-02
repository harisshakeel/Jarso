import { handleProviderEvent } from "@/features/payments/server";
import { AppError } from "@/lib";
import { json, withApi } from "@/lib/api";
import { getPaymentProviderById } from "@/lib/payments";

/**
 * Receives the active payment provider's signed events. The raw body is read once for the
 * signature check. An event this database doesn't know still answers 200 so the provider stops
 * retrying; a processing failure answers 5xx so it retries.
 */
export const POST = withApi(
  async (req: Request, ctx: RouteContext<"/api/v1/payments/webhooks/[provider]">) => {
    const { provider: id } = await ctx.params;
    const provider = getPaymentProviderById(id);
    if (!provider) throw new AppError("NOT_FOUND", "Not found");

    const raw = await req.text();
    const event = await provider.parseWebhook(raw, req.headers);
    if (event) await handleProviderEvent(provider.id, event);
    return json({ received: true });
  },
);
