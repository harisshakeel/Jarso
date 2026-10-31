import "server-only";
import { z } from "zod";
import { logger } from "@/lib";
import type { PaymentProviderId, ProviderEvent } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextStatus } from "../status";
import {
  applyPayment,
  armAutoCharge,
  failPayment,
  failSetup,
  findPaymentForWebhook,
  findSetupForWebhook,
  hasWebhookEvent,
  markPaymentRequiresAction,
  recordWebhookEvent,
  saveCustomerCard,
  succeedSetup,
} from "./repository";

type Admin = ReturnType<typeof createAdminClient>;
type Outcome = "applied" | "duplicate" | "ignored";
type PaymentEvent = Extract<ProviderEvent, { kind: "payment" }>;
type SetupEvent = Extract<ProviderEvent, { kind: "setup" | "setup_failed" }>;

const uuid = z.uuid();

/**
 * Applies one verified provider event. Local, preview and production share one test account, so
 * an event for a payment or setup this database doesn't have is normal: it is ignored, never an
 * error. The event is recorded only after it is processed, so a failure (say a deadlock in
 * apply_payment) throws, records nothing and the provider's retry runs it again. Two concurrent
 * copies may both run; that is safe because every step is idempotent and statuses only move
 * forward.
 */
export async function handleProviderEvent(
  provider: PaymentProviderId,
  event: ProviderEvent,
): Promise<Outcome> {
  const admin = createAdminClient();
  if (await hasWebhookEvent(admin, provider, event.eventId)) return "duplicate";
  const outcome =
    event.kind === "payment"
      ? await handlePayment(admin, provider, event)
      : await handleSetup(admin, provider, event);
  await recordWebhookEvent(admin, provider, event.eventId);
  return outcome;
}

async function handlePayment(
  admin: Admin,
  provider: PaymentProviderId,
  event: PaymentEvent,
): Promise<Outcome> {
  const log = { provider, eventId: event.eventId, paymentId: event.paymentId };
  const payment = uuid.safeParse(event.paymentId).success
    ? await findPaymentForWebhook(admin, event.paymentId)
    : null;
  if (!payment || payment.provider !== provider) {
    logger.info("Webhook for an unknown card payment ignored", log);
    return "ignored";
  }

  const next = nextStatus(payment.status, event.status);
  switch (next) {
    case "succeeded": {
      const result = await applyPayment(admin, payment.id);
      logger.info("Card payment applied", { ...log, providerRef: event.providerRef, result });
      return "applied";
    }
    case "failed":
    case "expired":
    case "canceled":
      await failPayment(admin, payment.id, next, event.failureCode ?? null);
      logger.info("Card payment ended", { ...log, status: next, failureCode: event.failureCode });
      return "applied";
    case "requires_action":
      await markPaymentRequiresAction(admin, payment.id);
      logger.info("Card payment needs action", log);
      return "applied";
    default:
      logger.info("Stale card payment webhook ignored", {
        ...log,
        current: payment.status,
        incoming: event.status,
      });
      return "ignored";
  }
}

async function handleSetup(
  admin: Admin,
  provider: PaymentProviderId,
  event: SetupEvent,
): Promise<Outcome> {
  const log = { provider, eventId: event.eventId, setupId: event.setupId };
  const setup = uuid.safeParse(event.setupId).success
    ? await findSetupForWebhook(admin, event.setupId)
    : null;
  if (!setup || setup.provider !== provider) {
    logger.info("Webhook for an unknown card setup ignored", log);
    return "ignored";
  }

  if (event.kind === "setup_failed") {
    await failSetup(admin, setup.id, event.reason);
    logger.info("Card setup ended", { ...log, reason: event.reason });
    return "applied";
  }

  if (setup.status === "succeeded") {
    logger.info("Card setup already saved; webhook ignored", log);
    return "ignored";
  }
  // Card, then toggle (it needs the card), then the setup's status last, so a retry after a
  // failure part-way redoes every step.
  const saved = await saveCustomerCard(admin, setup.parentId, provider, {
    methodRef: event.methodRef,
    card: event.card,
  });
  if (!saved) logger.warn("Card saved for a parent with no customer row", log);
  if (setup.arm) {
    const armed = await armAutoCharge(admin, setup.parentId, setup.arm, provider);
    if (armed === "refused") {
      // The gift was given or the schedule stopped meanwhile; the card is still saved.
      logger.info("Auto charge not turned on after saving the card", {
        ...log,
        armType: setup.arm.type,
        armId: setup.arm.id,
      });
    }
  }
  await succeedSetup(admin, setup.id);
  logger.info("Card setup saved", log);
  return "applied";
}
