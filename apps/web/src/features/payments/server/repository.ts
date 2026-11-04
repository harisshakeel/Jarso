import "server-only";
import type {
  AutoChargeTarget,
  CardSummary,
  FailureCode,
  PaymentSource,
} from "@jarso/core/payments";
import { isStoredStatus, type StoredStatus } from "@jarso/core/payments";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import { isPaymentProviderId, type PaymentProviderId } from "@/lib/payments";
import type { Database } from "@/types";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows the payment tables, columns and functions. No auth decisions. Reads take
 * the user's client (RLS: a parent sees their own customer and setups and their children's
 * payments); writes take the admin client, because the tables are service-role-write, and run
 * only after the service has authorised the caller.
 */

const UNIQUE_VIOLATION = "23505";
/** A stored provider name (the column's check allows only these). */
function asProviderId(value: string): PaymentProviderId {
  if (!isPaymentProviderId(value)) {
    throw new AppError("INTERNAL", "Unknown payment provider", { cause: value });
  }
  return value;
}
const failureCodes: readonly FailureCode[] = [
  "declined",
  "insufficient_funds",
  "authentication_required",
  "expired_card",
  "other",
];

export type SourceRow = PaymentSource & {
  childId: string;
  familyId: string;
  amountMinor: number;
  /** Still waiting for a handover: a `due` occurrence or a `pending` gift. */
  open: boolean;
  /** Family-local ISO date it falls due (an occurrence's due_on, a gift's give_on). */
  dueOn: string;
};

export type LivePayment = {
  id: string;
  trigger: "manual" | "auto";
  /** The provider this attempt went to. */
  provider: PaymentProviderId;
  status: "pending" | "requires_action";
  payerId: string | null;
  expiresAt: string | null;
  redirectUrl: string | null;
  /** Paid in the phone's native sheet rather than a hosted page. */
  inApp: boolean;
  /** The provider's checkout, intent or order id; null while it is still opening. */
  providerRef: string | null;
};

export type LatestPayment = { status: string; failureCode: FailureCode | null };

export type CustomerRow = {
  customerRef: string;
  methodRef: string | null;
  card: CardSummary | null;
};

/** The occurrence or gift, read through RLS. Null when missing or not visible. */
export async function findPaymentSource(
  db: Client,
  source: PaymentSource,
): Promise<SourceRow | null> {
  if (source.type === "occurrence") {
    const { data, error } = await db
      .from("allowance_occurrences")
      .select("id, child_id, family_id, amount_minor, status, due_on")
      .eq("id", source.id)
      .maybeSingle();
    if (error) throw toAppError(error, "Failed to load the allowance");
    if (!data) return null;
    return {
      type: "occurrence",
      id: data.id,
      childId: data.child_id,
      familyId: data.family_id,
      amountMinor: Number(data.amount_minor),
      open: data.status === "due",
      dueOn: data.due_on,
    };
  }
  const { data, error } = await db
    .from("parent_gifts")
    .select("id, child_id, family_id, amount_minor, status, give_on")
    .eq("id", source.id)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the gift");
  if (!data) return null;
  return {
    type: "parent_gift",
    id: data.id,
    childId: data.child_id,
    familyId: data.family_id,
    amountMinor: Number(data.amount_minor),
    open: data.status === "pending",
    dueOn: data.give_on,
  };
}

/** The source's pending / requires_action payment (at most one, by the live index), expired or not. */
export async function findLivePayment(
  db: Client,
  source: PaymentSource,
): Promise<LivePayment | null> {
  const { data, error } = await db
    .from("payments")
    .select(
      "id, trigger, provider, status, payer_id, expires_at, redirect_url, in_app, provider_ref",
    )
    .eq("source_type", source.type)
    .eq("source_id", source.id)
    .in("status", ["pending", "requires_action"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the card payment");
  if (!data) return null;
  return {
    id: data.id,
    trigger: data.trigger === "auto" ? "auto" : "manual",
    provider: asProviderId(data.provider),
    status: data.status === "requires_action" ? "requires_action" : "pending",
    payerId: data.payer_id,
    expiresAt: data.expires_at,
    redirectUrl: data.redirect_url,
    inApp: data.in_app,
    providerRef: data.provider_ref,
  };
}

export type PaymentRow = {
  id: string;
  childId: string;
  payerId: string | null;
  provider: PaymentProviderId;
  providerRef: string | null;
  status: StoredStatus;
  failureCode: FailureCode | null;
  trigger: "manual" | "auto";
  inApp: boolean;
  expiresAt: string | null;
};

/**
 * One payment by id, read with the user's client: null when there is none or RLS hides it (only
 * the child's parents read a payment).
 */
export async function findPaymentById(db: Client, paymentId: string): Promise<PaymentRow | null> {
  const { data, error } = await db
    .from("payments")
    .select(
      "id, child_id, payer_id, provider, provider_ref, status, failure_code, trigger, in_app, expires_at",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the card payment");
  if (!data || !isStoredStatus(data.status)) return null;
  const code = data.failure_code as FailureCode | null;
  return {
    id: data.id,
    childId: data.child_id,
    payerId: data.payer_id,
    provider: asProviderId(data.provider),
    providerRef: data.provider_ref,
    status: data.status,
    failureCode: code === null ? null : failureCodes.includes(code) ? code : "other",
    trigger: data.trigger === "auto" ? "auto" : "manual",
    inApp: data.in_app,
    expiresAt: data.expires_at,
  };
}

/** The source's newest payment of any status. */
export async function findLatestPayment(
  db: Client,
  source: PaymentSource,
): Promise<LatestPayment | null> {
  const { data, error } = await db
    .from("payments")
    .select("status, failure_code")
    .eq("source_type", source.type)
    .eq("source_id", source.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the card payment");
  if (!data) return null;
  const code = data.failure_code as FailureCode | null;
  return {
    status: data.status,
    failureCode: code === null ? null : failureCodes.includes(code) ? code : "other",
  };
}

/**
 * Inserts a payment. Null when another live payment for the source won the race (the
 * one-live-per-source index), so the caller can return that one instead.
 */
export async function insertPayment(
  admin: Client,
  row: {
    familyId: string;
    childId: string;
    payerId: string;
    provider: PaymentProviderId;
    source: PaymentSource;
    amountMinor: number;
    currency: string;
    cashMinor: number;
    savedMinor: number;
    trigger: "manual" | "auto";
    status: "pending";
    expiresAt: string | null;
    /** Paid in the phone's native sheet (manual only). */
    inApp?: boolean;
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from("payments")
    .insert({
      family_id: row.familyId,
      child_id: row.childId,
      payer_id: row.payerId,
      provider: row.provider,
      source_type: row.source.type,
      source_id: row.source.id,
      amount_minor: row.amountMinor,
      currency: row.currency,
      cash_minor: row.cashMinor,
      saved_minor: row.savedMinor,
      trigger: row.trigger,
      status: row.status,
      expires_at: row.expiresAt,
      in_app: row.inApp ?? false,
    })
    .select("id")
    .single();
  if (error?.code === UNIQUE_VIOLATION) return null;
  if (error) throw toAppError(error, "Failed to start the card payment");
  return data.id;
}

export async function setPaymentHosted(
  admin: Client,
  paymentId: string,
  hosted: { providerRef: string; redirectUrl: string },
): Promise<void> {
  const { error } = await admin
    .from("payments")
    .update({ provider_ref: hosted.providerRef, redirect_url: hosted.redirectUrl })
    .eq("id", paymentId);
  if (error) throw toAppError(error, "Failed to start the card payment");
}

/**
 * Stores an in-app payment's PaymentIntent or order id. False when another payment already holds
 * it (unique index).
 */
export async function setPaymentInApp(
  admin: Client,
  paymentId: string,
  providerRef: string,
): Promise<boolean> {
  const { error } = await admin
    .from("payments")
    .update({ provider_ref: providerRef })
    .eq("id", paymentId)
    .eq("in_app", true);
  if (error?.code === UNIQUE_VIOLATION) return false;
  if (error) throw toAppError(error, "Failed to start the card payment");
  return true;
}

/** A still-pending payment's split (cash + saved = amount, checked by payments_split_check). */
export async function setPendingSplit(
  admin: Client,
  paymentId: string,
  split: { cashMinor: number; savedMinor: number },
): Promise<void> {
  const { error } = await admin
    .from("payments")
    .update({ cash_minor: split.cashMinor, saved_minor: split.savedMinor })
    .eq("id", paymentId)
    .eq("status", "pending");
  if (error) throw toAppError(error, "Failed to update the card payment");
}

/** Pending / requires_action → expired. Any other status is left alone (fail_payment). */
export async function expirePayment(admin: Client, paymentId: string): Promise<void> {
  const { error } = await admin.rpc("fail_payment", {
    p_payment_id: paymentId,
    p_status: "expired",
    // Nullable in SQL; the generated types don't say so.
    p_failure_code: null as unknown as string,
  });
  if (error) throw toAppError(error, "Failed to update the card payment");
}

/** Pending / requires_action → canceled, freeing the source. */
export async function cancelPayment(admin: Client, paymentId: string): Promise<void> {
  const { error } = await admin.rpc("fail_payment", {
    p_payment_id: paymentId,
    p_status: "canceled",
    // Nullable in SQL; the generated types don't say so.
    p_failure_code: null as unknown as string,
  });
  if (error) throw toAppError(error, "Failed to update the card payment");
}

/** The parent's customer at the provider and their saved card, if any. */
export async function findCustomer(
  db: Client,
  parentId: string,
  provider: PaymentProviderId,
): Promise<CustomerRow | null> {
  const { data, error } = await db
    .from("payment_customers")
    .select("customer_ref, method_ref, card_brand, card_last4")
    .eq("parent_id", parentId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load your card");
  if (!data) return null;
  return {
    customerRef: data.customer_ref,
    methodRef: data.method_ref,
    card:
      data.method_ref && data.card_brand && data.card_last4
        ? { brand: data.card_brand, last4: data.card_last4 }
        : null,
  };
}

/** A repeat for the same parent and provider keeps the existing row (and its saved card). */
export async function insertCustomer(
  admin: Client,
  row: { parentId: string; provider: PaymentProviderId; customerRef: string },
): Promise<void> {
  const { error } = await admin
    .from("payment_customers")
    .upsert(
      { parent_id: row.parentId, provider: row.provider, customer_ref: row.customerRef },
      { onConflict: "parent_id,provider", ignoreDuplicates: true },
    );
  if (error) throw toAppError(error, "Failed to set up card payments");
}

export async function clearSavedCard(
  admin: Client,
  parentId: string,
  provider: PaymentProviderId,
): Promise<void> {
  const { error } = await admin
    .from("payment_customers")
    .update({ method_ref: null, card_brand: null, card_last4: null })
    .eq("parent_id", parentId)
    .eq("provider", provider);
  if (error) throw toAppError(error, "Failed to remove your card");
}

/** Turns off every auto-charge toggle the parent set that charges this provider's card. */
export async function clearAutoChargeBy(
  admin: Client,
  parentId: string,
  provider: PaymentProviderId,
): Promise<void> {
  const { error } = await admin.rpc("clear_auto_charge_by", {
    p_parent_id: parentId,
    p_provider: provider,
  });
  if (error) throw toAppError(error, "Failed to turn off auto charge");
}

/** A save-card session; `arm` is the toggle to turn on once the card is saved. */
export async function insertSetup(
  admin: Client,
  row: { parentId: string; provider: PaymentProviderId; arm: AutoChargeTarget | null },
): Promise<string> {
  const { data, error } = await admin
    .from("payment_setups")
    .insert({
      parent_id: row.parentId,
      provider: row.provider,
      arm_type: row.arm?.type ?? null,
      arm_id: row.arm?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw toAppError(error, "Failed to start saving your card");
  return data.id;
}

export async function setSetupProviderRef(
  admin: Client,
  setupId: string,
  providerRef: string,
): Promise<void> {
  const { error } = await admin
    .from("payment_setups")
    .update({ provider_ref: providerRef })
    .eq("id", setupId);
  if (error) throw toAppError(error, "Failed to start saving your card");
}

/** Whether `parentId` has a pending save-card session at `provider` for `providerRef`. */
export async function hasPendingSetup(
  db: Client,
  row: { parentId: string; provider: PaymentProviderId; providerRef: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("payment_setups")
    .select("id")
    .eq("parent_id", row.parentId)
    .eq("provider", row.provider)
    .eq("provider_ref", row.providerRef)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the card setup");
  return data !== null;
}

/** Pending → failed (or expired). Any other status is left alone. */
export async function failSetup(
  admin: Client,
  setupId: string,
  status: "failed" | "expired" = "failed",
): Promise<void> {
  const { error } = await admin
    .from("payment_setups")
    .update({ status })
    .eq("id", setupId)
    .eq("status", "pending");
  if (error) throw toAppError(error, "Failed to update the card setup");
}

/** The child an auto-charge target belongs to, read through RLS. Null when missing or not visible. */
export async function findAutoChargeTargetChildId(
  db: Client,
  target: AutoChargeTarget,
): Promise<string | null> {
  const table = target.type === "allowance_schedule" ? "allowance_schedules" : "parent_gifts";
  const { data, error } = await db.from(table).select("child_id").eq("id", target.id).maybeSingle();
  if (error) throw toAppError(error, "Failed to load auto charge");
  return data?.child_id ?? null;
}

/**
 * set_auto_charge as the signed-in parent. `no_card` when turning on finds no saved card at the
 * provider (JA409 "Save a card first"); any other refusal throws. `provider` is null only when
 * turning off: write_auto_charge then clears the toggle's provider and ignores the argument.
 */
export async function setAutoChargeFor(
  db: Client,
  target: AutoChargeTarget,
  on: boolean,
  provider: PaymentProviderId | null,
): Promise<"ok" | "no_card"> {
  const { error } = await db.rpc("set_auto_charge", {
    p_target_type: target.type,
    p_target_id: target.id,
    p_on: on,
    // The generated Args type says string, but the SQL takes null (off needs no provider).
    p_provider: provider as string,
  });
  if (error?.code === "JA409" && error.message === "Save a card first") return "no_card";
  if (error) throw toAppError(error, "Failed to change auto charge");
  return "ok";
}

// ---------------------------------------------------------------------------------------------
// Webhooks (admin client only)
// ---------------------------------------------------------------------------------------------

export async function hasWebhookEvent(
  admin: Client,
  provider: PaymentProviderId,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("payment_webhook_events")
    .select("event_id")
    .eq("provider", provider)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to check the webhook event");
  return data !== null;
}

/** Marks the event processed. A concurrent copy that already recorded it is fine. */
export async function recordWebhookEvent(
  admin: Client,
  provider: PaymentProviderId,
  eventId: string,
): Promise<void> {
  const { error } = await admin
    .from("payment_webhook_events")
    .upsert(
      { provider, event_id: eventId },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    );
  if (error) throw toAppError(error, "Failed to record the webhook event");
}

export type WebhookPayment = { id: string; provider: string; status: StoredStatus };

/** Null when there is no such payment (or its stored status is not one this code knows). */
export async function findPaymentForWebhook(
  admin: Client,
  paymentId: string,
): Promise<WebhookPayment | null> {
  const { data, error } = await admin
    .from("payments")
    .select("id, provider, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the card payment");
  if (!data || !isStoredStatus(data.status)) return null;
  return { id: data.id, provider: data.provider, status: data.status };
}

/** Posts a succeeded payment like a cash handover. Idempotent; returns apply_payment's outcome. */
export async function applyPayment(admin: Client, paymentId: string): Promise<string> {
  const { data, error } = await admin.rpc("apply_payment", { p_payment_id: paymentId });
  if (error) throw toAppError(error, "Failed to apply the card payment");
  return data;
}

/** Pending / requires_action → failed, expired or canceled. Any other status is left alone. */
export async function failPayment(
  admin: Client,
  paymentId: string,
  status: "failed" | "expired" | "canceled",
  failureCode: FailureCode | null,
): Promise<void> {
  const { error } = await admin.rpc("fail_payment", {
    p_payment_id: paymentId,
    p_status: status,
    // Nullable in SQL; the generated types don't say so.
    p_failure_code: failureCode as string,
  });
  if (error) throw toAppError(error, "Failed to update the card payment");
}

/** Pending → requires_action. Any other status is left alone. */
export async function markPaymentRequiresAction(admin: Client, paymentId: string): Promise<void> {
  const { error } = await admin
    .from("payments")
    .update({ status: "requires_action" })
    .eq("id", paymentId)
    .eq("status", "pending");
  if (error) throw toAppError(error, "Failed to update the card payment");
}

export type WebhookSetup = {
  id: string;
  parentId: string;
  provider: string;
  status: string;
  arm: AutoChargeTarget | null;
};

export async function findSetupForWebhook(
  admin: Client,
  setupId: string,
): Promise<WebhookSetup | null> {
  const { data, error } = await admin
    .from("payment_setups")
    .select("id, parent_id, provider, status, arm_type, arm_id")
    .eq("id", setupId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the card setup");
  if (!data) return null;
  const armType = data.arm_type;
  const arm: AutoChargeTarget | null =
    (armType === "allowance_schedule" || armType === "parent_gift") && data.arm_id
      ? { type: armType, id: data.arm_id }
      : null;
  return {
    id: data.id,
    parentId: data.parent_id,
    provider: data.provider,
    status: data.status,
    arm,
  };
}

/**
 * Stores the saved card on the parent's customer row. False when the parent has no customer at
 * the provider (a setup is only opened after the customer exists, so this should not happen).
 */
export async function saveCustomerCard(
  admin: Client,
  parentId: string,
  provider: PaymentProviderId,
  saved: { methodRef: string; card: CardSummary },
): Promise<boolean> {
  const { data, error } = await admin
    .from("payment_customers")
    .update({
      method_ref: saved.methodRef,
      card_brand: saved.card.brand,
      card_last4: saved.card.last4,
    })
    .eq("parent_id", parentId)
    .eq("provider", provider)
    .select("parent_id");
  if (error) throw toAppError(error, "Failed to save your card");
  return (data?.length ?? 0) > 0;
}

export async function succeedSetup(admin: Client, setupId: string): Promise<void> {
  const { error } = await admin
    .from("payment_setups")
    .update({ status: "succeeded" })
    .eq("id", setupId);
  if (error) throw toAppError(error, "Failed to update the card setup");
}

/**
 * Turns an auto-charge toggle on for an explicit parent, after a save-card webhook. `refused`
 * when the database says no (JA403: no longer allowed; JA409: nothing left to charge or no card);
 * any other error throws.
 */
/**
 * Turns on the toggle a save-card session was started for (arm_auto_charge_for_setup): "ok",
 * "cleared" when it was turned off meanwhile, "refused" when it can no longer be turned on.
 */
export async function armAutoChargeForSetup(
  admin: Client,
  setupId: string,
): Promise<"ok" | "cleared" | "refused"> {
  const { data, error } = await admin.rpc("arm_auto_charge_for_setup", { p_setup_id: setupId });
  if (error?.code === "JA403" || error?.code === "JA409") return "refused";
  if (error) throw toAppError(error, "Failed to turn on auto charge");
  return data ? "ok" : "cleared";
}

// ---------------------------------------------------------------------------------------------
// Auto charge (admin client only)
// ---------------------------------------------------------------------------------------------

export type DueAutoCharge = {
  source: PaymentSource;
  familyId: string;
  childId: string;
  payerId: string;
  amountMinor: number;
  currency: string;
  customerRef: string;
  methodRef: string;
  /** The provider whose saved card the toggle charges. */
  provider: PaymentProviderId;
};

/**
 * Due items with auto charge on at one of these providers and nothing claimed yet, oldest first
 * (due_auto_charges). A toggle on a provider not in the list is left out.
 */
export async function listDueAutoCharges(
  admin: Client,
  providers: readonly PaymentProviderId[],
  now: Date,
  limit: number,
): Promise<DueAutoCharge[]> {
  const { data, error } = await admin.rpc("due_auto_charges", {
    p_providers: [...providers],
    p_now: now.toISOString(),
    p_limit: limit,
  });
  if (error) throw toAppError(error, "Failed to load due auto charges");
  return (data ?? []).flatMap((row) =>
    row.source_type === "occurrence" || row.source_type === "parent_gift"
      ? [
          {
            source: { type: row.source_type, id: row.source_id },
            familyId: row.family_id,
            childId: row.child_id,
            payerId: row.payer_id,
            amountMinor: Number(row.amount_minor),
            currency: row.currency,
            customerRef: row.customer_ref,
            methodRef: row.method_ref,
            provider: asProviderId(row.provider),
          },
        ]
      : [],
  );
}

/** A live payment the sweep ends, with what it needs to cancel an in-app intent too. */
export type StaleLivePayment = {
  id: string;
  provider: PaymentProviderId;
  providerRef: string | null;
  inApp: boolean;
};

/** Pending / requires_action payments past their expires_at. */
export async function listStaleLivePayments(admin: Client, now: Date): Promise<StaleLivePayment[]> {
  const { data, error } = await admin
    .from("payments")
    .select("id, provider, provider_ref, in_app")
    .in("status", ["pending", "requires_action"])
    .lt("expires_at", now.toISOString())
    .limit(500);
  if (error) throw toAppError(error, "Failed to load stale card payments");
  return (data ?? []).map((row) => ({
    id: row.id,
    provider: asProviderId(row.provider),
    providerRef: row.provider_ref,
    inApp: row.in_app,
  }));
}

/** Stores the provider's ref. False when another payment already holds it (unique index). */
export async function setPaymentProviderRef(
  admin: Client,
  paymentId: string,
  providerRef: string,
): Promise<boolean> {
  const { error } = await admin
    .from("payments")
    .update({ provider_ref: providerRef })
    .eq("id", paymentId);
  if (error?.code === UNIQUE_VIOLATION) return false;
  if (error) throw toAppError(error, "Failed to update the card payment");
  return true;
}
