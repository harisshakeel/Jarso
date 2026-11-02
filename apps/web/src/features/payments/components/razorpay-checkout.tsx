"use client";

import { paymentCopy } from "@jarso/core/payments";
import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import { FormError } from "@/components/form";
import { Button, buttonVariants, Card, CardContent } from "@/components/ui";

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** The slice of Razorpay Checkout's browser API this page uses. */
type CheckoutOptions = {
  key: string;
  order_id: string;
  customer_id: string;
  recurring: "1";
  redirect: true;
  callback_url: string;
  modal: { ondismiss: () => void };
};
type CheckoutInstance = { open: () => void };
type CheckoutConstructor = new (options: CheckoutOptions) => CheckoutInstance;

/**
 * Opens Razorpay Checkout to save a card (spec D6). On success Checkout posts its form to
 * `callbackUrl` (Jarso's return route), which sends the parent on; the webhook saves the card.
 * Closing Checkout goes to `cancelUrl` with a full page load, as a hosted page on another site
 * would. Opens once on load; the button reopens it.
 */
export function RazorpayCheckout({
  keyId,
  orderId,
  customerId,
  callbackUrl,
  cancelUrl,
}: {
  keyId: string;
  orderId: string;
  customerId: string;
  callbackUrl: string;
  cancelUrl: string;
}) {
  const checkout = useRef<CheckoutInstance | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  const open = useCallback(() => {
    if (!checkout.current) {
      const Razorpay = (window as unknown as { Razorpay?: CheckoutConstructor }).Razorpay;
      if (!Razorpay) {
        setStatus("failed");
        return;
      }
      checkout.current = new Razorpay({
        key: keyId,
        order_id: orderId,
        customer_id: customerId,
        recurring: "1",
        redirect: true,
        callback_url: callbackUrl,
        modal: { ondismiss: () => window.location.assign(cancelUrl) },
      });
    }
    setStatus("ready");
    checkout.current.open();
  }, [keyId, orderId, customerId, callbackUrl, cancelUrl]);

  // onReady also fires when the page remounts with the script already loaded: open only once.
  const onReady = useCallback(() => {
    if (!checkout.current) open();
  }, [open]);
  const onError = useCallback(() => setStatus("failed"), []);

  return (
    <Card className="rise-in">
      <Script src={CHECKOUT_SCRIPT} onReady={onReady} onError={onError} />
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          <h1 className="font-bold text-xl">{paymentCopy.saveCard}</h1>
          <p className="text-ink-2 text-sm">{paymentCopy.saveCardOpening}</p>
          <p className="text-ink-2 text-sm">{paymentCopy.testMode}</p>
        </div>
        {status === "failed" ? (
          <>
            <FormError message={paymentCopy.cardFormFailed} />
            <a href={cancelUrl} className={buttonVariants({ variant: "outline", size: "lg" })}>
              {paymentCopy.goBack}
            </a>
          </>
        ) : (
          <Button size="lg" onClick={open} disabled={status === "loading"}>
            {paymentCopy.openCardForm}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
