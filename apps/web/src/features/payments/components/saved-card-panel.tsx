"use client";

import type { CardSummary, PaymentProviderId, SavedCard } from "@jarso/core/payments";
import { paymentCopy } from "@jarso/core/payments";
import { CreditCardIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@/components/ui";
import { runOnline } from "@/features/offline";
import { removeSavedCardAction } from "../server/actions";

/**
 * The parent's saved card at one provider in settings (spec §6.8): brand and last 4, and Remove,
 * which also turns off every auto charge that uses it. Cards are only saved by turning auto charge on.
 */
export function SavedCardPanel({
  provider,
  card,
}: {
  /** The provider the card is saved with (Remove detaches it there only). */
  provider: PaymentProviderId;
  card: CardSummary | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();

  function remove() {
    setError(undefined);
    startTransition(async () => {
      const result = await runOnline(() => removeSavedCardAction(null, { provider }));
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
        if (result.ok) {
          setOpen(false);
          toast.success(paymentCopy.removed);
        } else {
          setError(result.error);
        }
      });
    });
  }

  if (!card) return <p className="text-ink-2">{paymentCopy.noCard}</p>;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 font-bold">
        <CreditCardIcon aria-hidden className="size-5" />
        {paymentCopy.cardEnding(card.brand, card.last4)}
      </p>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogTrigger render={<Button type="button" variant="outline" size="lg" />}>
          {paymentCopy.removeCard}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{paymentCopy.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>{paymentCopy.removeDetail}</AlertDialogDescription>
          </AlertDialogHeader>
          <FormError error={error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Go back</AlertDialogCancel>
            <Button variant="destructive" loading={pending} onClick={remove}>
              {paymentCopy.removeCard}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The parent's saved cards in settings, one panel per provider that is on (multi-provider spec
 * §6). Each panel is titled with its provider only when there is more than one.
 */
export function SavedCards({ cards }: { cards: readonly SavedCard[] }) {
  const [only] = cards;
  if (only && cards.length === 1)
    return <SavedCardPanel provider={only.provider} card={only.card} />;
  return cards.map((saved) => (
    <section key={saved.provider} className="grid gap-2">
      <h3 className="font-bold">{saved.label}</h3>
      <SavedCardPanel provider={saved.provider} card={saved.card} />
    </section>
  ));
}
