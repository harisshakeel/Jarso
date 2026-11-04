import { AppError, type PaymentProviderId } from "@jarso/core/lib";
import type { AutoChargeTarget } from "@jarso/core/payments";
import { type Client, fetchScheduleAutoCharge, findGift } from "../allowance";

/** One auto-charge toggle's state, as the phone's switch shows it. Parents only. */
export type AutoChargeState = {
  on: boolean;
  /** The provider whose saved card pays while on; null when off. */
  provider: PaymentProviderId | null;
  /** The parent who turned it on (their card); null when off. */
  by: string | null;
  /** A gift whose day has passed while off: auto charge never back-charges it. */
  overdue: boolean;
};

/**
 * Reads a schedule's or gift's auto charge with the caller's client. The schedule's columns are
 * hidden behind `allowance_schedule_auto_charge` (parents only); a gift the caller can't read is
 * NOT_FOUND. `today` is the family's local date (`getFamilyContext`).
 */
export async function fetchAutoChargeState(
  db: Client,
  target: AutoChargeTarget,
  today: string,
): Promise<AutoChargeState> {
  if (target.type === "allowance_schedule") {
    const row = await fetchScheduleAutoCharge(db, target.id);
    return {
      on: row.autoCharge,
      provider: row.autoChargeProvider,
      by: row.autoChargeBy,
      overdue: false,
    };
  }
  const gift = await findGift(db, target.id);
  if (!gift) throw new AppError("NOT_FOUND", "We couldn't find that.");
  return {
    on: gift.autoCharge,
    provider: gift.autoChargeProvider,
    by: gift.autoChargeBy,
    overdue: !gift.autoCharge && gift.giveOn < today,
  };
}
