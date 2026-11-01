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
import type { AutoChargeCard, AutoChargeTarget, PaymentProviderId } from "../types";

type AutoChargeToggleProps = {
  target: AutoChargeTarget;
  /** The schedule's or gift's current `auto_charge`. */
  on: boolean;
  /** The provider whose saved card pays while on (`auto_charge_provider`); null when off. */
  provider: PaymentProviderId | null;
  /** The signed-in parent turned it on, so the card is theirs and can be named. */
  mine: boolean;
  /** Every provider that is on, with the parent's saved card there (`getAutoChargeCard`). */
  cards: readonly AutoChargeCard[];
  /** A gift's day has already passed: auto charge never back-charges, so it can't be used. */
  unavailable?: "overdue" | null;
};

/**
 * Auto charge for one allowance schedule or gift (spec §6.5, multi-provider spec §6). Turning on
 * with exactly one saved card uses it straight away; with several, the parent picks one. With
 * none, the parent first reads the mandate (and picks a provider when several are on), then goes
 * to the provider's page to save a card; the toggle turns on once the card is saved. While on,
 * with several providers on, it names the card it charges. Parents only.
 */
export function AutoChargeToggle(props: AutoChargeToggleProps) {
  const usable = props.cards.filter((card) => card.unavailableReason === null);
  if (props.unavailable === "overdue" || usable.length === 0) {
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
  return <AutoChargeSwitch {...props} usable={usable} />;
}

/** What the parent is asked before auto charge turns on, if anything. */
type Question = { kind: "choose"; options: AutoChargeCard[] } | { kind: "save" };

function AutoChargeSwitch({
  target,
  on,
  provider,
  mine,
  cards,
  usable,
}: AutoChargeToggleProps & { usable: AutoChargeCard[] }) {
  const returnTo = usePathname();
  const labelId = useId();
  const [checked, setChecked] = useState(on);
  // Follow a new `on` from the server (a refresh, or a page kept alive across navigation).
  const [shownOn, setShownOn] = useState(on);
  if (on !== shownOn) {
    setShownOn(on);
    setChecked(on);
  }
  // The question stays set while the dialog closes, so its text doesn't change mid-animation.
  const [question, setQuestion] = useState<Question>({ kind: "save" });
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState<PaymentProviderId>();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();

  /** Turns on with `using` (its saved card, or saving one there first), or turns off. */
  function save(next: boolean, using?: PaymentProviderId) {
    setError(undefined);
    setSaving(using);
    startTransition(async () => {
      const result = await runOnline(() =>
        setAutoChargeAction(
          null,
          next
            ? { ...target, on: true, provider: using, returnTo }
            : { ...target, on: false, returnTo },
        ),
      );
      // A card-saving result redirects to the provider. After an await, updates leave the
      // transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
        setAsking(false);
        if (result.ok) return;
        setChecked(!next);
        setError(result.error);
      });
    });
  }

  function toggle(next: boolean) {
    if (!next) {
      setChecked(false);
      save(false);
      return;
    }
    const saved = usable.filter((card) => card.card !== null);
    const [only] = saved;
    if (only && saved.length === 1) {
      setChecked(true);
      save(true, only.provider);
      return;
    }
    setError(undefined);
    setQuestion(saved.length > 1 ? { kind: "choose", options: saved } : { kind: "save" });
    setAsking(true);
  }

  // Name the card only when there is more than one it could be (several providers on).
  const current = cards.find((card) => card.provider === provider);
  const named =
    on && cards.length > 1 && current
      ? mine && current.card
        ? paymentCopy.charges(
            paymentCopy.cardAt(
              paymentCopy.cardEnding(current.card.brand, current.card.last4),
              current.label,
            ),
          )
        : paymentCopy.chargesOther(current.label)
      : null;

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
        {named ? <p className="font-semibold text-sm">{named}</p> : null}
        <FormError error={error} />
      </CardContent>

      <AlertDialog open={asking} onOpenChange={(open) => !pending && setAsking(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {question.kind === "choose" ? paymentCopy.chooseCardTitle : paymentCopy.saveCardTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {question.kind === "choose" ? paymentCopy.chooseCardDetail : paymentCopy.mandate}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{paymentCopy.notNow}</AlertDialogCancel>
            {(question.kind === "choose" ? question.options : usable).map((option) => (
              <Button
                key={option.provider}
                loading={pending && saving === option.provider}
                disabled={pending}
                onClick={() => {
                  // A saved card turns on straight away; saving one first waits for the provider.
                  if (question.kind === "choose") setChecked(true);
                  save(true, option.provider);
                }}
              >
                {question.kind === "choose" && option.card
                  ? paymentCopy.cardAt(
                      paymentCopy.cardEnding(option.card.brand, option.card.last4),
                      option.label,
                    )
                  : usable.length === 1
                    ? paymentCopy.saveCard
                    : paymentCopy.saveWith(option.label)}
              </Button>
            ))}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
