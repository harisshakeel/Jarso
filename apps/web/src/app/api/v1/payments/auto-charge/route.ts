import { assertRole } from "@/features/family/server";
import { inAppAutoChargeSchema } from "@/features/payments";
import { setAutoChargeInApp } from "@/features/payments/server";
import { json, parseBody, withApi } from "@/lib/api";

/**
 * For the phone: turns auto charge on or off for a schedule or gift. With no saved card, turning
 * on answers `{ setup }`, the native sheet's params for saving one; the toggle turns on when the
 * provider's webhook saves the card. Parents only.
 */
export const PATCH = withApi(
  async (request: Request) => {
    await assertRole("parent");
    const input = await parseBody(request, inAppAutoChargeSchema);
    return json(await setAutoChargeInApp(input));
  },
  { bearer: true },
);
