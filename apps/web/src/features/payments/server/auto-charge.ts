import "server-only";
import { paymentCopy } from "@jarso/core/payments";
import { getHandoverPrefillWith } from "@/features/allowance/server";
import { isAppError, logger } from "@/lib";
import { getPaymentProviderById, getPaymentProviders, type PaymentProvider } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { endLivePayment } from "./end-payment";
import {
  applyPayment,
  type DueAutoCharge,
  failPayment,
  insertPayment,
  listDueAutoCharges,
  listStaleLivePayments,
  setPaymentProviderRef,
} from "./repository";

type Admin = ReturnType<typeof createAdminClient>;
type Outcome = "succeeded" | "failed" | "pending" | "skipped";

export type AutoChargeResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

/** Items per run; the job runs hourly, so anything left over goes next hour. */
const BATCH = 50;

/**
 * Trusted cron job (no user): charges each due item with auto charge on, once, with the saved card
 * of the provider its toggle names (only providers that are on are selected). First expires live
 * payments past their expiry so they stop blocking selection. Each item is claimed by inserting
 * its `auto` payment (the one-auto-per-source index makes overlapping runs skip it), then the
 * saved card is charged (an amount the card can't charge, in a currency with no minimum or below
 * it, is claimed and failed straight away). A synchronous success posts through apply_payment, so
 * the later webhook is a no-op; a pending result waits for the webhook; a failure notifies the
 * payer. A provider outage leaves the row pending: it expires, and the item is never retried (one
 * attempt).
 */
export async function runAutoCharges(now: Date = new Date()): Promise<AutoChargeResult> {
  const result: AutoChargeResult = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
  const providers = getPaymentProviders();
  if (providers.length === 0) return result;
  const providerIds = providers.map((provider) => provider.id);
  const admin = createAdminClient();

  for (const stale of await listStaleLivePayments(admin, now)) {
    try {
      await endLivePayment(admin, stale, "expired");
    } catch (cause) {
      logger.error("Failed to expire a stale card payment", { paymentId: stale.id, cause });
    }
  }

  const due = await listDueAutoCharges(admin, providerIds, now, BATCH);
  for (const item of due) {
    const provider = getPaymentProviderById(item.provider);
    // due_auto_charges only returns the providers asked for, so this is a safety net.
    const outcome = provider ? await chargeOne(admin, provider, item, now) : "skipped";
    if (outcome === "skipped") {
      result.skipped += 1;
      continue;
    }
    result.attempted += 1;
    if (outcome === "succeeded") result.succeeded += 1;
    if (outcome === "failed") result.failed += 1;
  }
  logger.info("Auto charge run finished", { providers: providerIds, ...result });
  return result;
}

async function chargeOne(
  admin: Admin,
  provider: PaymentProvider,
  item: DueAutoCharge,
  now: Date,
): Promise<Outcome> {
  const log = { sourceType: item.source.type, sourceId: item.source.id, provider: provider.id };
  const minimum = provider.minimumChargeMinor(item.currency);
  const chargeable = minimum !== null && item.amountMinor >= minimum;

  let paymentId: string | null;
  try {
    // The allowance's planned split, else the last handover's share (ADR 0019).
    const split = await getHandoverPrefillWith(admin, {
      kind: item.source.type === "occurrence" ? "allowance" : "gift",
      id: item.source.id,
      childId: item.childId,
      amountMinor: item.amountMinor,
    });
    paymentId = await insertPayment(admin, {
      familyId: item.familyId,
      childId: item.childId,
      payerId: item.payerId,
      provider: provider.id,
      source: item.source,
      amountMinor: item.amountMinor,
      currency: item.currency,
      cashMinor: split.cash,
      savedMinor: split.saved,
      trigger: "auto",
      status: "pending",
      // An auto row that never settles (lost webhook, outage) stops blocking the item after this.
      expiresAt: new Date(now.getTime() + provider.autoChargeSettleMinutes * 60_000).toISOString(),
    });
  } catch (cause) {
    logger.error("Auto charge could not claim an item", { ...log, cause });
    return "skipped";
  }
  // Another run (or a manual payment) got there first.
  if (!paymentId) return "skipped";

  const plog = { ...log, paymentId };
  if (!chargeable) {
    // Claimed and failed at once, never sent to the provider: the payer gets one notice and the
    // item leaves selection instead of being picked (and skipped) every hour.
    try {
      await failPayment(admin, paymentId, "failed", "other");
    } catch (cause) {
      // Left pending: the stale sweep expires it, which notifies too.
      logger.error("Auto charge could not fail an unchargeable item", { ...plog, cause });
    }
    logger.warn("Auto charge failed: amount not chargeable by card", plog);
    return "failed";
  }

  let charge: Awaited<ReturnType<PaymentProvider["chargeSaved"]>>;
  try {
    charge = await provider.chargeSaved({
      paymentId,
      amountMinor: item.amountMinor,
      currency: item.currency,
      customerRef: item.customerRef,
      methodRef: item.methodRef,
      description:
        item.source.type === "occurrence"
          ? paymentCopy.allowanceFor("your child")
          : paymentCopy.giftFor("your child"),
    });
  } catch (cause) {
    // Left pending: the webhook (if the charge did go through) or the expiry settles it.
    logger.error("Auto charge provider call failed", {
      ...plog,
      code: isAppError(cause) ? cause.code : "UNKNOWN",
      cause,
    });
    return "failed";
  }

  try {
    if (charge.providerRef) {
      const stored = await setPaymentProviderRef(admin, paymentId, charge.providerRef);
      if (!stored) {
        logger.warn("Auto charge provider ref already used by another payment", {
          ...plog,
          providerRef: charge.providerRef,
        });
      }
    }
    if (charge.status === "succeeded") {
      const applied = await applyPayment(admin, paymentId);
      logger.info("Auto charge applied", { ...plog, providerRef: charge.providerRef, applied });
      return "succeeded";
    }
    if (charge.status === "failed") {
      const failureCode = charge.failureCode ?? "other";
      await failPayment(admin, paymentId, "failed", failureCode);
      logger.info("Auto charge failed", { ...plog, failureCode });
      return "failed";
    }
    logger.info("Auto charge waiting for the provider", { ...plog, status: charge.status });
    return "pending";
  } catch (cause) {
    // The charge happened; the webhook posts or fails it (apply_payment is idempotent).
    logger.error("Auto charge could not record the provider result", { ...plog, cause });
    return "failed";
  }
}
