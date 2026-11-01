"use client";

import { CreditCardIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { toMajorString } from "@/lib";
import { paymentCopy } from "../copy";
import { startCardPaymentAction } from "../server/actions";
import type { CardPaymentState } from "../types";
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
 * Pay by card on the handover screen, beside the cash button (spec §6.5). The card always pays the
 * full amount with the split as set; the action sends the parent to the provider's hosted page.
 * Shows the payment state above the button. Renders nothing when card payments are off. Parents
 * only.
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
  const [error, setError] = useState<{ code: string; message: string }>();

  // Interim (Task 3 replaces with one button per provider): pay with the first provider that
  // can take this amount, else show the first one's reason. None listed: payments are off.
  const choice = state.providers.find((p) => p.available) ?? state.providers[0];
  if (!choice) return null;
  const provider = choice.id;

  const fullAmount = split !== null && split.cash + split.saved === amountMinor;
  // An auto charge in flight has no page to go back to; a manual one reopens its page.
  const blocked = state.pending !== null && state.pending.redirectUrl === null;
  const reason =
    choice.unavailableReason === "too_small"
      ? paymentCopy.tooSmall
      : choice.unavailableReason === "unsupported_currency"
        ? paymentCopy.unsupportedCurrency
        : null;
  const helpId = `pay-by-card-${childId}-${id}`;

  function pay() {
    if (!split) return;
    setError(undefined);
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
      <Button
        type="button"
        variant="outline"
        size="lg"
        loading={pending}
        disabled={disabled || !choice.available || blocked || !fullAmount}
        aria-describedby={helpId}
        onClick={pay}
      >
        <CreditCardIcon aria-hidden />
        {paymentCopy.payByCard}
      </Button>
      <p id={helpId} className="text-center text-ink-2 text-sm">
        {reason ?? paymentCopy.fullAmount}
      </p>
      <FormError error={error} />
    </div>
  );
}
