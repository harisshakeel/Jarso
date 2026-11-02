import type { CardPaymentState } from "@jarso/core/payments";
import { failureCopy, paymentCopy } from "@jarso/core/payments";
import { cn } from "cn";
import { CreditCardIcon, HourglassIcon, type LucideIcon } from "lucide-react";

type Note = { icon: LucideIcon; tone: string; title: string; detail: string };

/** The note for a live attempt or the latest outcome, or null when there is nothing to say. */
function noteFor({ pending, lastOutcome }: CardPaymentState): Note | null {
  if (pending) {
    // Pending request treatment (design.md §2.5): surface 2, ink 2, hourglass.
    return {
      icon: HourglassIcon,
      tone: "bg-muted text-ink-2",
      title: paymentCopy.pendingTitle,
      detail: paymentCopy.pendingDetail,
    };
  }
  if (!lastOutcome) return null;
  // Informational, like a limit notice: gold, never red (design.md §2.4, §2.5).
  const tone = "bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold";
  if (lastOutcome.status === "succeeded_unapplied") {
    return { icon: CreditCardIcon, tone, title: paymentCopy.unapplied, detail: "" };
  }
  const reason = lastOutcome.failureCode ? failureCopy[lastOutcome.failureCode] : null;
  return {
    icon: CreditCardIcon,
    tone,
    title: paymentCopy.failedTitle,
    detail: reason ? `${reason} ${paymentCopy.failedDetail}` : paymentCopy.failedDetail,
  };
}

/**
 * The handover screen's card payment state, for the parent only: a payment in progress, one that
 * didn't go through, or one that arrived after the item was handed over in cash.
 */
export function PaymentStatusNote({ state }: { state: CardPaymentState }) {
  const note = noteFor(state);
  if (!note) return null;
  const { icon: Icon, tone, title, detail } = note;
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl px-4 py-3", tone)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="grid gap-0.5 text-sm">
        <p className="font-bold">{title}</p>
        {detail ? <p>{detail}</p> : null}
      </div>
    </div>
  );
}
