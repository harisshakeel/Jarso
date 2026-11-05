"use client";

import type { AutoChargeCard, AutoChargeTarget, PaymentProviderId } from "@jarso/core/payments";
import { paymentCopy } from "@jarso/core/payments";
import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from "react";
import { Field, FormError } from "@/components/form";
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
import { setAutoChargeAction } from "../server/actions";
import { ProviderLogo } from "./provider-logo";

/**
 * Which provider to save a card with (mockup v3 5): stacked full-width radio rows with the logo,
 * the name and a radio on the right; the chosen row has the primary border on secondary.
 */
function ProviderChoice({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly AutoChargeCard[];
  value: PaymentProviderId;
  disabled: boolean;
  onChange: (value: PaymentProviderId) => void;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option.provider}
          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-hairline-strong px-3 py-2 font-bold has-checked:border-primary has-checked:bg-secondary has-checked:text-secondary-foreground has-disabled:opacity-50"
        >
          <ProviderLogo provider={option.provider} />
          <span className="flex-1">{option.label}</span>
          <input
            type="radio"
            name={name}
            value={option.provider}
            checked={option.provider === value}
            onChange={() => onChange(option.provider)}
            className="size-[18px] accent-primary"
          />
        </label>
      ))}
    </fieldset>
  );
}

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
  /**
   * A gift's day has already passed: auto charge never back-charges, so it can't be turned on.
   * One already on still shows its switch, so the parent can turn it off.
   */
  unavailable?: "overdue" | null;
};

/**
 * Auto charge for one allowance schedule or gift (spec §6.5, multi-provider spec §6). Turning on
 * with exactly one saved card uses it straight away; with several, the parent picks one. With
 * none, the parent first reads the mandate (and picks a provider when several are on), then goes
 * to the provider's page to save a card; the toggle turns on once the card is saved. A provider
 * that needs the parent's mobile number asks for it in the same dialog first; it goes to the
 * provider with the account email, never into Jarso. While on, it names the card it charges.
 * Parents only.
 */
export function AutoChargeToggle(props: AutoChargeToggleProps) {
  const usable = props.cards.filter((card) => card.unavailableReason === null);
  const blocked = props.unavailable === "overdue" || usable.length === 0;
  if (blocked && !props.on) {
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
  return <AutoChargeSwitch {...props} usable={usable} blocked={blocked} />;
}

/** What the parent is asked before auto charge turns on, if anything. */
type Question = { kind: "choose"; options: AutoChargeCard[] } | { kind: "save" };

type ActionError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

/** A form value, or nothing when the field is absent or blank. */
function formValue(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function AutoChargeSwitch({
  target,
  on,
  provider,
  mine,
  cards,
  usable,
  blocked,
}: AutoChargeToggleProps & { usable: AutoChargeCard[]; blocked: boolean }) {
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
  // The provider whose mobile number step is showing (saving a card there needs it), if any.
  const [contactFor, setContactFor] = useState<AutoChargeCard | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  // The button that opened the step is gone, so keyboard focus goes to the field it asks for.
  useEffect(() => {
    if (contactFor) phoneRef.current?.focus();
  }, [contactFor]);
  const [saving, setSaving] = useState<PaymentProviderId>();
  // The provider picked in "Save a card first" (the first usable one until the parent picks).
  const [saveWith, setSaveWith] = useState<PaymentProviderId>();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError>();
  // An error from the mobile number step, shown in the dialog next to its fields.
  const [contactError, setContactError] = useState<ActionError>();

  /**
   * Turns on with `using` (its saved card, or saving one there first, with the parent's
   * `contact` when that provider needs it), or turns off.
   */
  function save(next: boolean, using?: PaymentProviderId, contact?: { phone?: string }) {
    setError(undefined);
    setContactError(undefined);
    setSaving(using);
    startTransition(async () => {
      const result = await runOnline(() =>
        setAutoChargeAction(
          null,
          next
            ? { ...target, on: true, provider: using, returnTo, ...contact }
            : { ...target, on: false, returnTo },
        ),
      );
      // A card-saving result redirects to the provider. After an await, updates leave the
      // transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
        if (!result.ok && contact) {
          // Stay on the mobile number step, so the parent can fix what was refused.
          setContactError(result.error);
          return;
        }
        setAsking(false);
        if (result.ok) return;
        setChecked(!next);
        setError(result.error);
      });
    });
  }

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactFor) return;
    const form = new FormData(event.currentTarget);
    const phone = formValue(form, "phone");
    save(true, contactFor.provider, phone ? { phone } : {});
  }

  function toggle(next: boolean) {
    // On but no longer allowed (an overdue gift): it can only be turned off.
    if (next && blocked) return;
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
    setContactError(undefined);
    setContactFor(null);
    setSaveWith(usable[0]?.provider);
    setQuestion(saved.length > 1 ? { kind: "choose", options: saved } : { kind: "save" });
    setAsking(true);
  }

  // While on, the card it charges on its own line: the parent's own by brand and last four, with
  // the provider it's saved with; another parent's by provider only.
  const current = on ? cards.find((card) => card.provider === provider) : undefined;
  const charged = current
    ? mine && current.card
      ? {
          title: paymentCopy.cardEnding(current.card.brand, current.card.last4),
          detail: paymentCopy.savedWith(current.label),
        }
      : { title: paymentCopy.chargesOther(current.label), detail: null }
    : null;

  const chosen = usable.find((card) => card.provider === saveWith) ?? usable[0];

  /** Saves a card with the chosen provider, after its mobile number step when it needs one. */
  function proceed() {
    if (!chosen) return;
    if (chosen.needsPhone && !chosen.card) {
      setContactError(undefined);
      setContactFor(chosen);
      return;
    }
    save(true, chosen.provider);
  }
  const cancel = <AlertDialogCancel disabled={pending}>{paymentCopy.notNow}</AlertDialogCancel>;
  const contactFieldErrors = contactError?.fieldErrors;

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
        {current && charged ? (
          <div className="flex items-center gap-3 border-hairline border-t pt-3">
            <ProviderLogo provider={current.provider} size="sm" />
            <p className="grid gap-0.5 text-sm">
              <span className="font-semibold">{charged.title}</span>
              {charged.detail ? <span className="text-ink-2">{charged.detail}</span> : null}
            </p>
          </div>
        ) : null}
        <FormError error={error} />
      </CardContent>

      <AlertDialog open={asking} onOpenChange={(open) => !pending && setAsking(open)}>
        <AlertDialogContent>
          {contactFor ? (
            <form noValidate onSubmit={submitContact} className="flex flex-col gap-4">
              <AlertDialogHeader>
                <AlertDialogTitle>{paymentCopy.contactTitle(contactFor.label)}</AlertDialogTitle>
                <AlertDialogDescription>
                  {paymentCopy.phoneHelp(contactFor.label)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Field
                ref={phoneRef}
                name="phone"
                label={paymentCopy.phoneLabel}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                disabled={pending}
                errors={contactFieldErrors?.phone}
              />
              <FormError error={contactFieldErrors ? undefined : contactError} />
              <AlertDialogFooter>
                {cancel}
                <Button type="submit" loading={pending} disabled={pending}>
                  {paymentCopy.continueToSave}
                </Button>
              </AlertDialogFooter>
            </form>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {question.kind === "choose"
                    ? paymentCopy.chooseCardTitle
                    : paymentCopy.saveCardTitle}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {question.kind === "choose" ? paymentCopy.chooseCardDetail : paymentCopy.mandate}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {question.kind === "choose" ? (
                // Several saved cards don't fit one row: stack them full width, in provider
                // order, with "Not now" last.
                <AlertDialogFooter className="flex-col sm:flex-col">
                  {question.options.map((option) => (
                    <Button
                      key={option.provider}
                      loading={pending && saving === option.provider}
                      disabled={pending}
                      onClick={() => {
                        setChecked(true);
                        save(true, option.provider);
                      }}
                    >
                      <ProviderLogo provider={option.provider} size="sm" />
                      {option.card
                        ? paymentCopy.cardAt(
                            paymentCopy.cardEnding(option.card.brand, option.card.last4),
                            option.label,
                          )
                        : option.label}
                    </Button>
                  ))}
                  {cancel}
                </AlertDialogFooter>
              ) : (
                <>
                  {usable.length > 1 && chosen ? (
                    <ProviderChoice
                      label={paymentCopy.saveCardTitle}
                      options={usable}
                      value={chosen.provider}
                      disabled={pending}
                      onChange={setSaveWith}
                    />
                  ) : null}
                  <AlertDialogFooter>
                    {cancel}
                    {/* The chosen row already shows the provider; the name says it too. */}
                    <Button
                      aria-label={chosen ? paymentCopy.proceedWith(chosen.label) : undefined}
                      loading={pending}
                      disabled={pending || !chosen}
                      onClick={proceed}
                    >
                      {paymentCopy.proceed}
                    </Button>
                  </AlertDialogFooter>
                </>
              )}
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
