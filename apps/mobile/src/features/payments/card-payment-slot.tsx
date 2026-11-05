import {
  type CardPaymentState,
  failureCopy,
  type PaymentProviderId,
  paymentCopy,
} from "@jarso/core/payments";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Card } from "@/components/screen";
import { Notice } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { actionErrorMessage, flash } from "@/lib";
import { keys } from "@/lib/query";
import { cancelInAppPayment, startInAppPayment } from "./api";
import { CardNote } from "./card-note";
import { ProviderRow } from "./provider-rows";
import { presentSheet, type SheetOutcome, useFakeSheet } from "./sheets";
import { usePaymentProviders } from "./use-payment-providers";
import { usePaymentStatus } from "./use-payment-status";

export type CardPaymentSlotProps = {
  kind: "allowance" | "gift";
  id: string;
  childId: string;
  amountMinor: number;
  currency: string;
  /** The handover form's current cash/saved split; the server prefills when absent. */
  split?: { spendMinor: number; saveMinor: number };
};

/**
 * One trip through the native sheet: which payment, which provider, how the sheet ended, and
 * whether the server lets the parent cancel it (not a Razorpay order: it only expires).
 */
type Attempt = {
  key: number;
  paymentId: string;
  provider: PaymentProviderId;
  cancellable: boolean;
  outcome: SheetOutcome;
};

/** The failed note's line: the reason when the provider gave one. */
const failedLine = (code: keyof typeof failureCopy | null) =>
  code ? failureCopy[code] : paymentCopy.failedDetail;

/**
 * Paying a handover by card in the native sheet (mockups D, F, G), the web's `PayByCard` and
 * `PaymentStatusNote`. One row per provider that can take the amount (logo and name). After the
 * sheet the block reads the status back from the server and shows only what the server says: the phone
 * never reports a payment as paid. A sheet closed early leaves the payment in progress, with
 * Pay again (the server reuses the same intent) and Cancel where the provider can cancel it.
 * Renders nothing when card payments are off. Parents only.
 */
export function CardPaymentSlot({ kind, id, childId, amountMinor, split }: CardPaymentSlotProps) {
  const providers = usePaymentProviders({ childId, kind, id });
  const queryClient = useQueryClient();
  const fake = useFakeSheet();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const state = providers.data?.item;
  if (!state || state.providers.length === 0) return fake.element ?? null;

  // The card pays the full amount; a short split waits for the parent to fix it.
  const fullAmount = !split || split.spendMinor + split.saveMinor === amountMinor;

  async function pay(provider: PaymentProviderId) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const started = await startInAppPayment({
        kind,
        id,
        provider,
        ...(split ? { cashMinor: split.spendMinor, savedMinor: split.saveMinor } : {}),
      });
      const outcome = await presentSheet(started.sheet, { onFake: fake.open });
      setAttempt((prev) => ({
        key: (prev?.key ?? 0) + 1,
        paymentId: started.paymentId,
        provider,
        cancellable: started.cancellable,
        outcome,
      }));
    } catch (cause) {
      setError(await actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(paymentId: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const { canceled } = await cancelInAppPayment(paymentId);
      if (canceled) {
        flash(paymentCopy.cancelled);
        setAttempt(null);
      } else {
        // Nothing left to cancel: it ended meanwhile (often paid). Read it again and show it.
        setAttempt((prev) => prev && { ...prev, key: prev.key + 1 });
      }
      void queryClient.invalidateQueries({ queryKey: keys.payments() });
    } catch (cause) {
      setError(await actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const footer = <Notice message={error} />;
  const idle = (
    <ChooseProvider
      state={state}
      fullAmount={fullAmount}
      busy={busy}
      onPay={(provider) => void pay(provider)}
      footer={footer}
    />
  );
  const pending = (provider: PaymentProviderId, paymentId: string | null) => (
    <InProgress
      busy={busy}
      onPayAgain={() => void pay(provider)}
      onCancel={paymentId ? () => void cancel(paymentId) : null}
      footer={footer}
    />
  );

  let body: ReactNode;
  if (attempt) {
    body = (
      <AttemptResult
        key={attempt.key}
        attempt={attempt}
        idle={idle}
        pending={pending(attempt.provider, attempt.cancellable ? attempt.paymentId : null)}
        busy={busy}
        onPayAgain={() => void pay(attempt.provider)}
        footer={footer}
      />
    );
  } else if (state.pending) {
    // Left open in another session. Its payment id isn't known here, so there is no Cancel:
    // finding it by starting again could replace a web checkout with a new intent.
    body = pending(state.pending.provider, null);
  } else {
    body = idle;
  }

  return (
    <>
      {fake.element}
      {body}
    </>
  );
}

/** The provider buttons (mockup D), with the latest outcome above them when there is one. */
function ChooseProvider({
  state,
  fullAmount,
  busy,
  onPay,
  footer,
}: {
  state: CardPaymentState;
  fullAmount: boolean;
  busy: boolean;
  onPay: (provider: PaymentProviderId) => void;
  footer: ReactNode;
}) {
  const available = state.providers.filter((p) => p.available);
  // No provider can pay: "too small" when one could charge the currency, else the currency.
  const reason =
    available.length > 0
      ? null
      : state.providers.some((p) => p.unavailableReason === "too_small")
        ? paymentCopy.tooSmall
        : paymentCopy.unsupportedCurrency;
  const last = state.lastOutcome;

  return (
    <Card>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {paymentCopy.orPayByCard}
      </Text>
      {last?.status === "failed" ? (
        <CardNote
          tone="error"
          title={paymentCopy.failedTitle}
          detail={failedLine(last.failureCode)}
        />
      ) : last?.status === "succeeded_unapplied" ? (
        <CardNote tone="warn" title={paymentCopy.unapplied} />
      ) : null}
      {available.length > 0 ? (
        available.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p.id}
            label={p.label}
            accessibilityLabel={paymentCopy.payWith(p.label)}
            busy={busy}
            disabled={busy || !fullAmount}
            onPress={() => onPay(p.id)}
          />
        ))
      ) : (
        <Button
          variant="outline"
          accessibilityLabel={paymentCopy.payByCard}
          accessibilityState={{ disabled: true }}
          disabled
        >
          <Text>{paymentCopy.payByCard}</Text>
        </Button>
      )}
      {reason || !fullAmount ? (
        <Text className="text-muted-foreground text-small">{reason ?? paymentCopy.fullAmount}</Text>
      ) : null}
      {footer}
      <Text className="text-muted-foreground text-small">{paymentCopy.testMode}</Text>
    </Card>
  );
}

/** A payment still open (mockup G): Pay again reopens the same intent; Cancel when it's ours. */
function InProgress({
  busy,
  onPayAgain,
  onCancel,
  footer,
}: {
  busy: boolean;
  onPayAgain: () => void;
  onCancel: (() => void) | null;
  footer: ReactNode;
}) {
  return (
    <Card>
      <CardNote tone="warn" title={paymentCopy.pendingTitle} detail={paymentCopy.pendingDetail} />
      <Button
        accessibilityLabel={paymentCopy.payAgain}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onPayAgain}
      >
        {busy ? <ActivityIndicator color="white" /> : <Text>{paymentCopy.payAgain}</Text>}
      </Button>
      {onCancel ? (
        <Button
          variant="outline"
          accessibilityLabel={paymentCopy.cancelPayment}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onCancel}
        >
          <Text>{paymentCopy.cancelPayment}</Text>
        </Button>
      ) : null}
      {footer}
      <Text className="text-muted-foreground text-small">{paymentCopy.testMode}</Text>
    </Card>
  );
}

/** After the sheet (mockup F): what the server says, polled until it's final. */
function AttemptResult({
  attempt,
  idle,
  pending,
  busy,
  onPayAgain,
  footer,
}: {
  attempt: Attempt;
  idle: ReactNode;
  pending: ReactNode;
  busy: boolean;
  onPayAgain: () => void;
  footer: ReactNode;
}) {
  const { view, stillConfirming, gaveUp } = usePaymentStatus(attempt.paymentId);

  if (view?.final) {
    switch (view.status) {
      case "succeeded":
        return (
          <Card>
            <CardNote tone="ok" title={paymentCopy.received} />
          </Card>
        );
      case "succeeded_unapplied":
        return (
          <Card>
            <CardNote tone="warn" title={paymentCopy.unapplied} />
          </Card>
        );
      case "failed":
        return (
          <Card>
            <CardNote
              tone="error"
              title={paymentCopy.failedTitle}
              detail={failedLine(view.failureCode)}
            />
            <Button
              variant="outline"
              accessibilityLabel={paymentCopy.payAgain}
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={onPayAgain}
            >
              <Text>{paymentCopy.payAgain}</Text>
            </Button>
            {footer}
          </Card>
        );
      default:
        // Expired or cancelled: nothing is open any more, so offer the card again.
        return idle;
    }
  }

  // Closed before it finished, or still not final after 2 minutes of reading: it stays open at
  // the provider until it expires, so offer Pay again and Cancel rather than a spinner.
  if (attempt.outcome === "closed" || gaveUp) return pending;

  return (
    <Card>
      <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
        <ActivityIndicator />
        <Text className="flex-1">
          {stillConfirming ? paymentCopy.stillConfirming : paymentCopy.confirming}
        </Text>
      </View>
    </Card>
  );
}
