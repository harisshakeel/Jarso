import type { Gift, Schedule, Split } from "@jarso/core/allowance";
import {
  type Client,
  fetchNextDueOn,
  fetchScheduleAutoCharge,
  findLatestAllowanceSplit,
  findLatestGiftSplit,
  findScheduleRow,
  listPendingGifts,
} from "./repository";

/**
 * Parent-side allowance reads. No auth here: the caller checks it is a parent of the child (the
 * auto-charge function also refuses anyone else). `viewerId` is the signed-in parent.
 */

/** The child's latest schedule (a stopped one too, so it can say so) with its payment state. */
export async function getParentSchedule(
  db: Client,
  childId: string,
  viewerId: string,
): Promise<Schedule | null> {
  const row = await findScheduleRow(db, childId);
  if (!row) return null;
  const [nextDueOn, { autoChargeBy, ...autoCharge }] = await Promise.all([
    row.status === "stopped" ? null : fetchNextDueOn(db, row.id),
    fetchScheduleAutoCharge(db, row.id),
  ]);
  return { ...row, ...autoCharge, autoChargeMine: autoChargeBy === viewerId, nextDueOn };
}

/** Gifts not handed over yet (due and future), soonest first. */
export async function listGiftsFor(db: Client, childId: string, viewerId: string): Promise<Gift[]> {
  const gifts = await listPendingGifts(db, childId);
  return gifts.map(({ autoChargeBy, ...gift }) => ({
    ...gift,
    autoChargeMine: autoChargeBy === viewerId,
  }));
}

/**
 * The newer of the child's last allowance and last gift split, read with `db`. No auth: the
 * caller authorises, or passes the admin client from a trusted job (the auto charge).
 */
export async function getLastSplitWith(db: Client, childId: string): Promise<Split | null> {
  const [allowance, gift] = await Promise.all([
    findLatestAllowanceSplit(db, childId),
    findLatestGiftSplit(db, childId),
  ]);
  const latest =
    allowance && gift
      ? Date.parse(gift.at) > Date.parse(allowance.at)
        ? gift
        : allowance
      : (allowance ?? gift);
  return latest ? { cash: latest.cash, saved: latest.saved } : null;
}
