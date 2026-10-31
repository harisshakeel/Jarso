"use client";

import { useActionState, useEffect } from "react";
import { FormError } from "@/components/form";
import { Button, Card, CardContent } from "@/components/ui";
import { idle } from "@/lib";
import { paymentCopy } from "../copy";
import type { FakeCheckoutParams } from "../schemas";
import { completeFakeCheckoutAction } from "../server/fake-checkout";

const BUTTONS = {
  payment: [
    { outcome: "pay", label: "Pay", variant: "default" },
    { outcome: "fail", label: "Fail", variant: "outline" },
    { outcome: "cancel", label: "Cancel", variant: "ghost" },
  ],
  setup: [
    { outcome: "ok", label: "Save card that works", variant: "default" },
    { outcome: "decline", label: "Save card that declines", variant: "outline" },
    { outcome: "cancel", label: "Cancel", variant: "ghost" },
  ],
} as const;

/**
 * Stand-in for the provider's hosted checkout when PAYMENTS_PROVIDER=fake (dev and e2e only).
 * Each button sends the event the provider would, then returns to the app with a full page load,
 * as a real hosted page on another site does (a soft navigation would keep the old page's client
 * state). `params`, not spread props: `ref` is reserved in React.
 */
export function FakeCheckout({ params }: { params: FakeCheckoutParams }) {
  const { mode, ref, success, cancel } = params;
  const [state, action, pending] = useActionState(completeFakeCheckoutAction, idle);
  const returnTo = state?.ok ? state.data.returnTo : null;
  useEffect(() => {
    if (returnTo) window.location.assign(returnTo);
  }, [returnTo]);
  return (
    <Card className="rise-in">
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          <h1 className="font-bold text-xl">
            {mode === "payment" ? "Fake card payment" : "Fake save a card"}
          </h1>
          <p className="text-ink-2 text-sm">{paymentCopy.testMode}</p>
        </div>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="ref" value={ref} />
          <input type="hidden" name="success" value={success} />
          <input type="hidden" name="cancel" value={cancel} />
          {BUTTONS[mode].map((button) => (
            <Button
              key={button.outcome}
              type="submit"
              name="outcome"
              value={button.outcome}
              variant={button.variant}
              size="lg"
              disabled={pending || returnTo !== null}
            >
              {button.label}
            </Button>
          ))}
        </form>
        <FormError error={state?.ok === false ? state.error : undefined} />
      </CardContent>
    </Card>
  );
}
