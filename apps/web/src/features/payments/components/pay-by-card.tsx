"use client";

import type { CardPaymentState, PaymentProviderId } from "@jarso/core/payments";
import { paymentCopy, providerLogo } from "@jarso/core/payments";
import { ChevronRightIcon, CreditCardIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { toMajorString } from "@/lib";
import { startCardPaymentAction } from "../server/actions";
import { PaymentStatusNote } from "./payment-status-note";
import { ProviderLogo } from "./provider-logo";

type PayByCardProps = {
  childId: string;
  kind: "allowance" | "gift";
  /** The occurrence or gift id. */
  id: string;
  amountMinor: number;
  currency: string;
  /** The split set on the handover form, in minor units; null while it doesn't parse. */
  split: { cash: number; saved: number } | null;
  state: CardPaymentState;
  /** Blocks the button while the cash handover is being saved. */
  disabled?: boolean;
};

/**
 * Pay by card on the handover screen, beside the cash button (spec §6.5). One row per provider
 * that can take this amount: its logo and name, read as "Pay with {label}" (multi-provider spec
 * D2). With none, one disabled "Pay by card" says why. The card always pays the full amount with
 * the split as set; the action sends the parent to the chosen provider's hosted page. A provider
 * whose checkout is open reopens it; another provider replaces it (D7). Shows the payment state
 * above the rows. Renders nothing when card payments are off. Parents only.
 */
export function PayByCard({
  childId,
  kind,
  id,
  amountMinor,
  currency,
  split,
  state,
  disabled = false,
}: PayByCardProps) {
  const [pending, startTransition] = useTransition();
  const [paying, setPaying] = useState<PaymentProviderId>();
  const [error, setError] = useState<{ code: string; message: string }>();

  if (state.providers.length === 0) return null;
  const available = state.providers.filter((p) => p.available);
  const fullAmount = split !== null && split.cash + split.saved === amountMinor;
  // An auto charge in flight has no page to go back to; a manual one reopens its page.
  const blocked = state.pending !== null && state.pending.redirectUrl === null;
  // No provider can pay: "too small" when one could charge the currency, else the currency.
  const reason =
    available.length > 0
      ? null
      : state.providers.some((p) => p.unavailableReason === "too_small")
        ? paymentCopy.tooSmall
        : paymentCopy.unsupportedCurrency;
  const helpId = `pay-by-card-${childId}-${id}`;

  function pay(provider: PaymentProviderId) {
    if (!split) return;
    setError(undefined);
    setPaying(provider);
    startTransition(async () => {
      const result = await runOnline(() =>
        startCardPaymentAction(null, {
          kind,
          id,
          provider,
          cash: toMajorString(split.cash, currency),
          saved: toMajorString(split.saved, currency),
        }),
      );
      // On success the action redirects to the provider. After an await, updates leave the
      // transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
        if (!result.ok) setError(result.error);
      });
    });
  }

  return (
    <div className="grid gap-3">
      <PaymentStatusNote state={state} />
      {available.length > 0 ? (
        available.map((p) => (
          // A row per provider: its logo and name (the card's heading says what it does), with
          // the verb kept in the accessible name.
          <Button
            key={p.id}
            type="button"
            variant="outline"
            size="lg"
            className="h-auto min-h-12 w-full justify-start gap-3 rounded-2xl px-3 py-2"
            aria-label={paymentCopy.payWith(p.label)}
            loading={pending && paying === p.id}
            disabled={disabled || blocked || !fullAmount || pending}
            aria-describedby={helpId}
            onClick={() => pay(p.id)}
          >
            {providerLogo(p.id) ? <ProviderLogo provider={p.id} /> : <CreditCardIcon aria-hidden />}
            <span className="flex-1 text-left">{p.label}</span>
            <ChevronRightIcon aria-hidden className="text-ink-2" />
          </Button>
        ))
      ) : (
        <Button type="button" variant="outline" size="lg" disabled aria-describedby={helpId}>
          <CreditCardIcon aria-hidden />
          {paymentCopy.payByCard}
        </Button>
      )}
      <p id={helpId} className="text-center text-ink-2 text-sm">
        {reason ?? paymentCopy.fullAmount}
      </p>
      <FormError error={error} />
    </div>
  );
}
