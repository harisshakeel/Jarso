import "server-only";
import { clientEnv } from "@/config";
import { assertUser } from "@/features/auth/server";
import {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  getFamily,
  listChildren,
} from "@/features/family/server";
import { AppError, familyToday, logger } from "@/lib";
import {
  getPaymentProviderById,
  getPaymentProviders,
  type PaymentProvider,
  type PaymentProviderId,
  paymentsEnabled,
} from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { paymentCopy } from "../copy";
import { phoneSchema, returnToSchema } from "../schemas";
import type {
  AutoChargeCard,
  AutoChargeTarget,
  CardPaymentState,
  PaymentSource,
  SavedCard,
} from "../types";
import {
  cancelPayment,
  clearAutoChargeBy,
  clearSavedCard,
  expirePayment,
  failSetup,
  findAutoChargeTargetChildId,
  findCustomer,
  findLatestPayment,
  findLivePayment,
  findPaymentSource,
  insertCustomer,
  insertPayment,
  insertSetup,
  type LatestPayment,
  type LivePayment,
  type SourceRow,
  setAutoChargeFor,
  setPaymentHosted,
  setPendingSplit,
  setSetupProviderRef,
} from "./repository";

/**
 * Card handover: pay a due allowance or gift by card, save a card, toggle auto charge. Parents
 * only. The provider never posts money here: a succeeded payment reaches the ledger through the
 * webhook (apply_payment). Reads use the user's client; payment, customer and setup writes use
 * the admin client (the tables are service-role-write), only after the caller is authorised.
 */

/**
 * Hosted checkout lifetime, stored as the payment's expires_at and sent to the provider, so both
 * end at the same moment. 31, not 30: Stripe refuses an expiry under 30 minutes from when it
 * receives the request, and the time is fixed before the network round trips.
 */
const CHECKOUT_MINUTES = 31;
const FORBIDDEN = "You can't do that.";

/** The chosen provider when it is on, else NOT_FOUND (an off provider has no entry points). */
function requireProvider(id: PaymentProviderId): PaymentProvider {
  const provider = getPaymentProviderById(id);
  if (!provider) throw new AppError("NOT_FOUND", paymentCopy.off);
  return provider;
}

const kindOf = (type: PaymentSource["type"]) => (type === "occurrence" ? "allowance" : "gift");

/** A live payment still inside its window (manual: checkout; auto: time to settle). */
const unexpired = (live: LivePayment, now: number) =>
  live.expiresAt === null || Date.parse(live.expiresAt) > now;

/** The family's currency, or FORBIDDEN without an approved membership. */
async function familyOrThrow() {
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "Set up your family first.");
  return family;
}

/** The parent's provider customer, created at the provider (idempotent per parent) and stored. */
async function ensureCustomerRef(
  provider: PaymentProvider,
  parent: { id: string; email: string | null },
): Promise<string> {
  const existing = await findCustomer(await createClient(), parent.id, provider.id);
  if (existing) return existing.customerRef;
  const { customerRef } = await provider.ensureCustomer({
    parentId: parent.id,
    email: parent.email,
  });
  await insertCustomer(createAdminClient(), {
    parentId: parent.id,
    provider: provider.id,
    customerRef,
  });
  return customerRef;
}

/** The phone a save-card request may carry. */
type ContactInput = { phone?: string };

/**
 * The contact a provider that needs one gets when a card is saved there (undefined for the
 * others): the account email and the tidied phone. Never an email from the request: the
 * provider finds its customer by email and phone, so a typed email could reach another parent's
 * customer and their saved cards. VALIDATION when the account has no email, or with a field
 * error when the phone is missing or malformed. Neither value is stored or logged.
 */
function setupContact(
  provider: PaymentProvider,
  parent: { email: string | null },
  input: ContactInput,
): { email: string; phone: string } | undefined {
  if (!provider.setupNeedsContact) return undefined;
  if (!parent.email) throw new AppError("VALIDATION", paymentCopy.noAccountEmail(provider.label));
  const phone = phoneSchema.safeParse(input.phone);
  if (!phone.success) {
    throw new AppError("VALIDATION", "Please fix the highlighted fields.", {
      fieldErrors: { phone: phone.error.issues.map((issue) => issue.message) },
    });
  }
  return { email: parent.email, phone: phone.data };
}

/** An absolute URL on this app for an in-app path, with `card=<state>` added to its query. */
function appUrl(returnTo: string, card: string): string {
  if (!returnToSchema.safeParse(returnTo).success) {
    throw new AppError("VALIDATION", paymentCopy.badReturn);
  }
  const url = new URL(returnTo, clientEnv.NEXT_PUBLIC_APP_URL);
  if (url.origin !== new URL(clientEnv.NEXT_PUBLIC_APP_URL).origin) {
    throw new AppError("VALIDATION", paymentCopy.badReturn);
  }
  url.searchParams.set("card", card);
  return url.toString();
}

/** Why a card can't pay this amount in this currency, or null when it can. */
function unavailableFor(
  provider: PaymentProvider,
  currency: string,
  amountMinor: number,
): "too_small" | "unsupported_currency" | null {
  const minimum = provider.minimumChargeMinor(currency);
  if (minimum === null) return "unsupported_currency";
  return amountMinor < minimum ? "too_small" : null;
}

/** The latest attempt as an outcome the parent should hear about, or null. */
function outcomeOf(latest: LatestPayment | null): CardPaymentState["lastOutcome"] {
  if (!latest) return null;
  const { status, failureCode } = latest;
  if (status === "failed" || status === "succeeded_unapplied") return { status, failureCode };
  return null;
}

/** Reads the source through RLS and checks the caller may read it for this child. */
async function readableSource(childId: string, source: PaymentSource): Promise<SourceRow> {
  await assertParentCanRead(childId);
  const row = await findPaymentSource(await createClient(), source);
  if (!row || row.childId !== childId) throw new AppError("FORBIDDEN", FORBIDDEN);
  return row;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * What the handover screen shows about paying this item by card, per provider that is on (none:
 * payments are off). A provider that can't charge the family's currency is still listed, with
 * its reason. `pending` names the provider of the live attempt. Parent only.
 */
export async function getCardPaymentState(
  childId: string,
  source: PaymentSource,
): Promise<CardPaymentState> {
  const providers = getPaymentProviders();
  if (providers.length === 0) {
    await assertParentCanRead(childId);
    return { providers: [], pending: null, lastOutcome: null };
  }
  const row = await readableSource(childId, source);
  const db = await createClient();
  const [family, live, latest] = await Promise.all([
    familyOrThrow(),
    findLivePayment(db, source),
    findLatestPayment(db, source),
  ]);
  const pending =
    live && unexpired(live, Date.now())
      ? { provider: live.provider, redirectUrl: live.redirectUrl }
      : null;
  return {
    providers: providers.map((provider) => {
      const reason = unavailableFor(provider, family.currency, row.amountMinor);
      return {
        id: provider.id,
        label: provider.label,
        available: reason === null,
        unavailableReason: reason,
      };
    }),
    pending,
    lastOutcome: pending ? null : outcomeOf(latest),
  };
}

/** The parent's saved card (or null) at each of these providers. */
async function savedCardsAt(
  parentId: string,
  providers: readonly PaymentProvider[],
): Promise<SavedCard[]> {
  const db = await createClient();
  return Promise.all(
    providers.map(async (provider) => ({
      provider: provider.id,
      label: provider.label,
      card: (await findCustomer(db, parentId, provider.id))?.card ?? null,
    })),
  );
}

/** Whether this provider can charge the family's currency at all. */
const chargesCurrency = (provider: PaymentProvider, currency: string) =>
  provider.minimumChargeMinor(currency) !== null;

/**
 * The signed-in parent's saved card at each provider that is on (card null when none). A
 * provider that can't charge the family's currency is left out unless a card is saved there,
 * so it can still be removed. Empty without a family.
 */
export async function getSavedCards(): Promise<SavedCard[]> {
  const user = await assertUser();
  const providers = getPaymentProviders();
  if (providers.length === 0) return [];
  const family = await getFamily();
  if (!family) return [];
  const cards = await savedCardsAt(user.id, providers);
  return providers.flatMap((provider, i) => {
    const saved = cards[i];
    const shown = saved && (saved.card !== null || chargesCurrency(provider, family.currency));
    return shown ? [saved] : [];
  });
}

/**
 * What an auto-charge toggle needs, per provider that is on: null with payments off (no toggle
 * renders), else the signed-in parent's saved card there, if any (without one, turning on saves
 * a card first), and whether that provider can charge the family's currency at all.
 */
export async function getAutoChargeCard(): Promise<AutoChargeCard[] | null> {
  const providers = getPaymentProviders();
  if (providers.length === 0) return null;
  const user = await assertUser();
  const [cards, family] = await Promise.all([savedCardsAt(user.id, providers), familyOrThrow()]);
  return providers.map((provider, i) => {
    const card = cards[i]?.card ?? null;
    return {
      provider: provider.id,
      label: provider.label,
      cardSaved: card !== null,
      card,
      unavailableReason: chargesCurrency(provider, family.currency) ? null : "unsupported_currency",
      needsPhone: provider.setupNeedsContact,
    };
  });
}

/** VALIDATION when this provider can't charge the family's currency at all. */
async function assertChargesFamilyCurrency(provider: PaymentProvider): Promise<void> {
  const family = await familyOrThrow();
  if (!chargesCurrency(provider, family.currency)) {
    throw new AppError("VALIDATION", paymentCopy.unsupportedCurrency);
  }
}

// ---------------------------------------------------------------------------
// Pay by card
// ---------------------------------------------------------------------------

/**
 * Opens a hosted checkout at the chosen provider for the item's full amount and returns its URL.
 * A second call while the first checkout is live returns the same URL when it is the same
 * provider; another provider's live checkout is cancelled first (D7). A live one past its expiry
 * is marked expired and replaced. Nothing is posted here: the webhook posts on success.
 */
export async function startCardPayment(input: {
  kind: "allowance" | "gift";
  id: string;
  provider: PaymentProviderId;
  cashMinor: number;
  savedMinor: number;
}): Promise<{ redirectUrl: string }> {
  const provider = requireProvider(input.provider);
  const source: PaymentSource = {
    type: input.kind === "allowance" ? "occurrence" : "parent_gift",
    id: input.id,
  };
  const db = await createClient();
  const row = await findPaymentSource(db, source);
  if (!row) {
    await assertRole("parent");
    throw new AppError("FORBIDDEN", FORBIDDEN);
  }
  const parent = await assertParentOf(row.childId);
  const family = await familyOrThrow();

  if (!row.open) throw new AppError("CONFLICT", paymentCopy.notDue);
  if (row.type === "parent_gift" && row.dueOn > familyToday(family.timezone)) {
    throw new AppError("CONFLICT", paymentCopy.giftNotDue);
  }
  if (input.cashMinor + input.savedMinor !== row.amountMinor) {
    throw new AppError("VALIDATION", paymentCopy.fullAmount, {
      fieldErrors: { cash: [paymentCopy.fullAmount] },
    });
  }
  const reason = unavailableFor(provider, family.currency, row.amountMinor);
  if (reason === "too_small") throw new AppError("VALIDATION", paymentCopy.tooSmall);
  if (reason) throw new AppError("VALIDATION", paymentCopy.unsupportedCurrency);

  const admin = createAdminClient();
  const split = { cashMinor: input.cashMinor, savedMinor: input.savedMinor };
  const reused = await reuseLive(db, admin, source, split, provider.id, true);
  if (reused) return { redirectUrl: reused };

  const customerRef = await ensureCustomerRef(provider, parent);
  const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60_000);
  const paymentId = await insertPayment(admin, {
    familyId: row.familyId,
    childId: row.childId,
    payerId: parent.id,
    provider: provider.id,
    source,
    amountMinor: row.amountMinor,
    currency: family.currency,
    cashMinor: input.cashMinor,
    savedMinor: input.savedMinor,
    trigger: "manual",
    status: "pending",
    expiresAt: expiresAt.toISOString(),
  });
  if (!paymentId) {
    // A parallel click inserted first: send this one to the same checkout. Never cancel the
    // winner, even when it chose another provider.
    const winner = await reuseLive(db, admin, source, split, provider.id, false);
    if (winner) return { redirectUrl: winner };
    throw new AppError("CONFLICT", paymentCopy.inProgress);
  }

  const nickname = (await listChildren()).find((child) => child.id === row.childId)?.nickname;
  const kind = kindOf(source.type);
  const description =
    kind === "allowance"
      ? paymentCopy.allowanceFor(nickname ?? "your child")
      : paymentCopy.giftFor(nickname ?? "your child");
  const back = `/parent/children/${row.childId}/handover/${kind}/${row.id}`;

  let hosted: { redirectUrl: string; providerRef: string };
  try {
    hosted = await provider.createHostedPayment({
      paymentId,
      amountMinor: row.amountMinor,
      currency: family.currency,
      customerRef,
      description,
      successUrl: appUrl(back, "returned"),
      cancelUrl: appUrl(back, "cancelled"),
      expiresAt,
    });
  } catch (error) {
    // Free the source: a pending row with no checkout would block it until it expires.
    try {
      await cancelPayment(admin, paymentId);
    } catch (cause) {
      logger.error("Failed to cancel a card payment after a provider error", { paymentId, cause });
    }
    throw error;
  }
  await setPaymentHosted(admin, paymentId, hosted);
  logger.info("Card payment started", { paymentId, providerRef: hosted.providerRef });
  return { redirectUrl: hosted.redirectUrl };
}

/**
 * The live payment's checkout URL when it can be reused (same provider), with its split changed
 * to this request's (the split is ours: the provider only sees the full amount). Past its expiry
 * it is marked expired (null: start a new one). Another provider's open manual checkout is
 * cancelled when `switchProvider` (null: start a new one; D7). Anything else live (an auto charge
 * in flight, a manual one still opening or waiting on the bank) is a CONFLICT.
 */
async function reuseLive(
  db: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  source: PaymentSource,
  split: { cashMinor: number; savedMinor: number },
  providerId: PaymentProviderId,
  switchProvider: boolean,
): Promise<string | null> {
  const live = await findLivePayment(db, source);
  if (!live) return null;
  if (!unexpired(live, Date.now())) {
    await expirePayment(admin, live.id);
    return null;
  }
  if (live.trigger === "manual" && live.redirectUrl) {
    if (live.provider === providerId) {
      await setPendingSplit(admin, live.id, split);
      return live.redirectUrl;
    }
    // If it still completes at the old provider, apply_payment posts it or marks it unapplied.
    if (switchProvider && live.status === "pending") {
      await cancelPayment(admin, live.id);
      logger.info("Card payment cancelled to switch provider", {
        paymentId: live.id,
        from: live.provider,
        to: providerId,
      });
      return null;
    }
  }
  throw new AppError("CONFLICT", paymentCopy.inProgress);
}

/**
 * The parent backed out of the hosted checkout: cancel their live manual checkout for this item
 * so it stops showing as in progress. Anything else (an auto charge, another parent's checkout,
 * one waiting on the bank) is left alone. A payment that still completes at the provider posts
 * anyway: apply_payment accepts a success on a canceled row.
 */
export async function cancelCardPayment(childId: string, source: PaymentSource): Promise<void> {
  if (!paymentsEnabled()) throw new AppError("NOT_FOUND", paymentCopy.off);
  const parent = await assertParentOf(childId);
  const db = await createClient();
  const row = await findPaymentSource(db, source);
  if (!row || row.childId !== childId) throw new AppError("FORBIDDEN", FORBIDDEN);
  const live = await findLivePayment(db, source);
  if (live?.trigger !== "manual" || live.status !== "pending" || live.payerId !== parent.id) return;
  await cancelPayment(createAdminClient(), live.id);
  logger.info("Card payment cancelled at checkout", { paymentId: live.id });
}

// ---------------------------------------------------------------------------
// Saved card and auto charge
// ---------------------------------------------------------------------------

/** Authorises the caller as a parent of the target's child (read through RLS). */
async function assertParentOfTarget(target: AutoChargeTarget) {
  const childId = await findAutoChargeTargetChildId(await createClient(), target);
  if (!childId) {
    await assertRole("parent");
    throw new AppError("FORBIDDEN", FORBIDDEN);
  }
  return assertParentOf(childId);
}

/**
 * Opens the chosen provider's hosted save-card page. With `arm`, the webhook turns that
 * auto-charge toggle on once the card is saved, unless it was turned off meanwhile
 * (arm_auto_charge_for_setup re-checks the arm and the parent then).
 * A provider that needs the parent's contact gets `phone` and the account email (`setupContact`).
 */
export async function startCardSetup(
  input: {
    provider: PaymentProviderId;
    arm: AutoChargeTarget | null;
    returnTo: string;
  } & ContactInput,
): Promise<{ redirectUrl: string }> {
  const provider = requireProvider(input.provider);
  const parent = input.arm
    ? await assertParentOfTarget(input.arm)
    : (await assertRole("parent")).user;
  await assertChargesFamilyCurrency(provider);
  return openSetup(provider, parent, input.arm, input.returnTo, input);
}

async function openSetup(
  provider: PaymentProvider,
  parent: { id: string; email: string | null },
  arm: AutoChargeTarget | null,
  returnTo: string,
  contactInput: ContactInput,
): Promise<{ redirectUrl: string }> {
  const successUrl = appUrl(returnTo, "saved");
  const cancelUrl = appUrl(returnTo, "cancelled");
  // Checked before anything is created, so a missing phone leaves no customer or setup behind.
  const contact = setupContact(provider, parent, contactInput);
  const customerRef = await ensureCustomerRef(provider, parent);
  const admin = createAdminClient();
  const setupId = await insertSetup(admin, { parentId: parent.id, provider: provider.id, arm });

  let hosted: { redirectUrl: string; providerRef: string };
  try {
    hosted = await provider.createHostedSetup({
      setupId,
      customerRef,
      successUrl,
      cancelUrl,
      ...(contact ? { contact } : {}),
    });
  } catch (error) {
    try {
      await failSetup(admin, setupId);
    } catch (cause) {
      logger.error("Failed to mark a card setup failed after a provider error", { setupId, cause });
    }
    throw error;
  }
  await setSetupProviderRef(admin, setupId, hosted.providerRef);
  logger.info("Card setup started", { setupId, providerRef: hosted.providerRef });
  return { redirectUrl: hosted.redirectUrl };
}

/**
 * Turns auto charge on (charging the chosen provider's saved card) or off (no provider needed).
 * On with no saved card there returns a save-card URL instead (with the parent's contact when
 * that provider needs it); the toggle turns on when the card is saved.
 */
export async function setAutoCharge(
  input: AutoChargeTarget & {
    on: boolean;
    provider?: PaymentProviderId;
    returnTo: string;
  } & ContactInput,
): Promise<{ redirectUrl: string | null }> {
  if (!input.on) return turnAutoChargeOff({ type: input.type, id: input.id });
  if (!input.provider) throw new AppError("VALIDATION", paymentCopy.chooseProvider);
  const provider = requireProvider(input.provider);
  const target: AutoChargeTarget = { type: input.type, id: input.id };
  const parent = await assertParentOfTarget(target);
  await assertChargesFamilyCurrency(provider);
  const db = await createClient();

  const customer = await findCustomer(db, parent.id, provider.id);
  if (!customer?.methodRef) return openSetup(provider, parent, target, input.returnTo, input);
  let result: "ok" | "no_card";
  try {
    result = await setAutoChargeFor(db, target, true, provider.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") {
      throw new AppError("CONFLICT", paymentCopy.nothingToCharge, { cause: error });
    }
    throw error;
  }
  // The card was removed between the read and the write.
  if (result === "no_card") return openSetup(provider, parent, target, input.returnTo, input);
  return { redirectUrl: null };
}

async function turnAutoChargeOff(target: AutoChargeTarget): Promise<{ redirectUrl: null }> {
  if (!paymentsEnabled()) throw new AppError("NOT_FOUND", paymentCopy.off);
  await assertParentOfTarget(target);
  await setAutoChargeFor(await createClient(), target, false, null);
  return { redirectUrl: null };
}

/**
 * Detaches the parent's saved card at the chosen provider, forgets it, and turns off the
 * auto-charge toggles they set that charge it (toggles on other providers' cards stay on).
 */
export async function removeSavedCard(input: { provider: PaymentProviderId }): Promise<void> {
  const provider = requireProvider(input.provider);
  const { user } = await assertRole("parent");
  const customer = await findCustomer(await createClient(), user.id, provider.id);
  const admin = createAdminClient();
  if (customer?.methodRef) {
    await provider.detachMethod(customer.methodRef);
    await clearSavedCard(admin, user.id, provider.id);
  }
  await clearAutoChargeBy(admin, user.id, provider.id);
}
