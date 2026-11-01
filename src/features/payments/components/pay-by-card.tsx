"use client";

import { CreditCardIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { toMajorString } from "@/lib";
import { paymentCopy } from "../copy";
import { startCardPaymentAction } from "../server/actions";
import type { CardPaymentState, PaymentProviderId } from "../types";
import { PaymentStatusNote } from "./payment-status-note";

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
 * Pay by card on the handover screen, beside the cash button (spec §6.5). One button per provider
 * that can take this amount: "Pay by card" when there is one, "Pay with {label}" when there are
 * several (multi-provider spec D2). With none, one disabled "Pay by card" says why. The card
 * always pays the full amount with the split as set; the action sends the parent to the chosen
 * provider's hosted page. A provider whose checkout is open reopens it; another provider replaces
 * it (D7). Shows the payment state above the buttons. Renders nothing when card payments are off.
 * Parents only.
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

  const buttons =
    available.length > 0
      ? available.map((p) => ({
          id: p.id,
          label: available.length === 1 ? paymentCopy.payByCard : paymentCopy.payWith(p.label),
        }))
      : [{ id: null, label: paymentCopy.payByCard }];

  return (
    <div className="grid gap-3">
      <PaymentStatusNote state={state} />
      {buttons.map((button) => (
        <Button
          key={button.id ?? "none"}
          type="button"
          variant="outline"
          size="lg"
          loading={pending && paying === button.id}
          disabled={disabled || button.id === null || blocked || !fullAmount || pending}
          aria-describedby={helpId}
          onClick={() => button.id && pay(button.id)}
        >
          <CreditCardIcon aria-hidden />
          {button.label}
        </Button>
      ))}
      <p id={helpId} className="text-center text-ink-2 text-sm">
        {reason ?? paymentCopy.fullAmount}
      </p>
      <FormError error={error} />
    </div>
  );
}
