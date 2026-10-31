"use client";

import { usePathname } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  Switch,
} from "@/components/ui";
import { runOnline } from "@/features/offline";
import { paymentCopy } from "../copy";
import { setAutoChargeAction } from "../server/actions";
import type { AutoChargeTarget } from "../types";

type AutoChargeToggleProps = {
  target: AutoChargeTarget;
  /** The schedule's or gift's current `auto_charge`. */
  on: boolean;
  /** Whether the parent has a saved card. Without one, turning on saves a card first. */
  cardSaved: boolean;
  /**
   * Why auto charge can't work here, shown instead of the switch: a card can't charge the
   * family's currency, or a gift's day has already passed (auto charge never back-charges).
   */
  unavailable?: "unsupported_currency" | "overdue" | null;
};

/**
 * Auto charge for one allowance schedule or gift (spec §6.5). With a saved card it switches
 * straight away. Without one, the parent first reads the mandate, then goes to the provider's
 * page to save a card; the toggle turns on once the card is saved. Parents only.
 */
export function AutoChargeToggle(props: AutoChargeToggleProps) {
  if (props.unavailable) {
    return (
      <Card className="rise-in">
        <CardContent className="grid gap-1">
          <span className="font-semibold">{paymentCopy.autoCharge}</span>
          <p className="text-ink-2 text-sm">
            {props.unavailable === "overdue"
              ? paymentCopy.autoChargeOverdue
              : paymentCopy.unsupportedCurrency}
          </p>
        </CardContent>
      </Card>
    );
  }
  return <AutoChargeSwitch {...props} />;
}

function AutoChargeSwitch({ target, on, cardSaved }: AutoChargeToggleProps) {
  const returnTo = usePathname();
  const labelId = useId();
  const [checked, setChecked] = useState(on);
  // Follow a new `on` from the server (a refresh, or a page kept alive across navigation).
  const [shownOn, setShownOn] = useState(on);
  if (on !== shownOn) {
    setShownOn(on);
    setChecked(on);
  }
  const [askToSave, setAskToSave] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();

  function save(next: boolean) {
    setError(undefined);
    startTransition(async () => {
      const result = await runOnline(() =>
        setAutoChargeAction(null, { ...target, on: next, returnTo }),
      );
      // A card-saving result redirects to the provider. After an await, updates leave the
      // transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
        if (result.ok) return;
        setChecked(!next);
        setAskToSave(false);
        setError(result.error);
      });
    });
  }

  function toggle(next: boolean) {
    if (next && !cardSaved) {
      setError(undefined);
      setAskToSave(true);
      return;
    }
    setChecked(next);
    save(next);
  }

  return (
    <Card className="rise-in">
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <span id={labelId} className="font-semibold">
            {paymentCopy.autoCharge}
          </span>
          <Switch
            aria-labelledby={labelId}
            checked={checked}
            disabled={pending}
            onCheckedChange={toggle}
          />
        </div>
        <p className="text-ink-2 text-sm">
          {target.type === "allowance_schedule"
            ? paymentCopy.autoChargeAllowance
            : paymentCopy.autoChargeGift}{" "}
          {paymentCopy.testMode}
        </p>
        <FormError error={error} />
      </CardContent>

      <AlertDialog open={askToSave} onOpenChange={(open) => !pending && setAskToSave(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{paymentCopy.saveCardTitle}</AlertDialogTitle>
            <AlertDialogDescription>{paymentCopy.mandate}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{paymentCopy.notNow}</AlertDialogCancel>
            <Button loading={pending} onClick={() => save(true)}>
              {paymentCopy.saveCard}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
