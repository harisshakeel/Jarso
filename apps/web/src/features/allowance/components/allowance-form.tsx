"use client";

import {
  allowanceCelebrationCopy,
  allowanceFormCopy,
  DEFAULT_SAVE_SHARE,
  describeSchedule,
  type Frequency,
  formatDay,
  frequencies,
  SAVE_SHARES,
  type Schedule,
  saveForShare,
  scheduleSplit,
  shareOfSave,
} from "@jarso/core/allowance";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useActionState, useState } from "react";
import { toast } from "sonner";
import { celebrate } from "@/components/celebrate";
import { AmountField, ChoiceChips, Field, FieldError, FormError } from "@/components/form";
import { Button, buttonVariants, Card, CardContent, Input, Label } from "@/components/ui";
import { routes } from "@/config";
import { runOnline } from "@/features/offline";
import { type ActionState, addDays, formatMoney, idle, parseMoney, toMajorString } from "@/lib";
import { changeAllowanceAction, createAllowanceAction } from "../server/actions";

const ONE_TIME = "one_time";

const frequencyLabels: Record<Frequency, string> = allowanceFormCopy.frequencyLabels;

type AllowanceFormProps = {
  childId: string;
  currency: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
  /** Present when changing a running or paused allowance. */
  initial?: Schedule;
};

/**
 * Set up an allowance, or change the amount and how often (when `initial` is given), with the
 * planned Spend/Save split (ADR 0019): a share of the amount, or a typed Save; Spend is the rest.
 */
export function AllowanceForm({ childId, currency, today, initial }: AllowanceFormProps) {
  const router = useRouter();
  const changing = initial !== undefined;
  const [state, action, pending] = useActionState(
    async (_prev: ActionState<unknown>, formData: FormData) => {
      const result = changing
        ? await runOnline(() => changeAllowanceAction(null, formData))
        : await runOnline(() => createAllowanceAction(null, formData));
      if (result.ok) {
        const minor = parseMoney(amount, currency);
        if (changing) toast.success(allowanceFormCopy.saved);
        else
          celebrate({
            icon: "coins",
            title: allowanceCelebrationCopy.allowanceTitle,
            amount: minor === null ? undefined : formatMoney(minor, currency),
            body: allowanceCelebrationCopy.allowanceBody(formatDay(date)),
          });
        // Both stay on the Allowance page, where a first allowance due today shows at once.
        router.push(routes.parentAllowance(childId));
      }
      return result;
    },
    idle,
  );
  // Controlled so they survive a failed submit (React resets uncontrolled fields).
  const [amount, setAmount] = useState(initial ? toMajorString(initial.amountMinor, currency) : "");
  const [frequency, setFrequency] = useState<string>(initial?.frequency ?? "weekly");
  const [date, setDate] = useState(initial?.nextDueOn ?? today);
  // The split: a share of the amount (Save follows the amount), or null once Save is typed.
  const planned = initial?.saveMinor ?? null;
  const [share, setShare] = useState<number | null>(() =>
    initial && planned !== null
      ? shareOfSave(initial.amountMinor, planned, currency)
      : DEFAULT_SAVE_SHARE,
  );
  const [typedSave, setTypedSave] = useState(
    planned !== null ? toMajorString(planned, currency) : "",
  );
  const amountMinor = parseMoney(amount, currency);
  const saveText =
    share === null
      ? typedSave
      : amountMinor === null
        ? ""
        : toMajorString(saveForShare(amountMinor, share, currency), currency);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  const options = [
    ...frequencies.map((value) => ({ value, label: frequencyLabels[value] })),
    ...(changing ? [] : [{ value: ONE_TIME, label: allowanceFormCopy.oneTime }]),
  ];

  function chooseFrequency(value: string) {
    if (value === ONE_TIME) {
      const query = amount.trim() ? `?amount=${encodeURIComponent(amount.trim())}` : "";
      router.push(`${routes.parentGiftNew(childId)}${query}` as Route);
      return;
    }
    setFrequency(value);
  }

  const summary =
    date && frequencies.includes(frequency as Frequency)
      ? describeSchedule(frequency as Frequency, date)
      : null;
  const dateName = changing ? "nextOn" : "firstOn";
  // Paused through a date: the next one has to come after the pause (the database refuses it).
  const pausedThrough =
    initial?.status === "paused" && initial.pausedThrough && initial.pausedThrough >= today
      ? initial.pausedThrough
      : null;
  const minDate = pausedThrough ? addDays(pausedThrough, 1) : today;

  return (
    <form action={action} className="grid gap-4" noValidate>
      {initial ? (
        <input type="hidden" name="scheduleId" value={initial.id} />
      ) : (
        <input type="hidden" name="childId" value={childId} />
      )}
      <Card className="rise-in shadow-raised">
        <CardContent>
          <AmountField
            currency={currency}
            value={amount}
            onValueChange={setAmount}
            errors={fieldErrors?.amount}
          />
        </CardContent>
      </Card>
      <SplitField
        currency={currency}
        amountMinor={amountMinor}
        share={share}
        saveText={saveText}
        onShare={setShare}
        onSaveText={(value) => {
          setShare(null);
          setTypedSave(value);
        }}
        errors={fieldErrors?.save}
      />
      <Card className="rise-in" style={{ "--rise-index": 2 } as CSSProperties}>
        <CardContent>
          <ChoiceChips
            name="frequency"
            legend={allowanceFormCopy.howOften}
            options={options}
            value={frequency}
            onValueChange={chooseFrequency}
          />
          <FieldError errors={fieldErrors?.frequency} />
        </CardContent>
      </Card>
      <Card className="rise-in" style={{ "--rise-index": 3 } as CSSProperties}>
        <CardContent className="grid gap-2">
          <Label htmlFor={dateName}>
            {changing ? allowanceFormCopy.nextOn : allowanceFormCopy.firstOn}
          </Label>
          <Input
            id={dateName}
            name={dateName}
            type="date"
            min={minDate}
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-invalid={fieldErrors?.[dateName]?.length ? true : undefined}
          />
          {summary ? <p className="text-ink-2 text-sm">{summary}</p> : null}
          {pausedThrough ? (
            <p className="text-ink-2 text-sm">
              {allowanceFormCopy.pausedUntil(formatDay(pausedThrough))}
            </p>
          ) : null}
          <FieldError errors={fieldErrors?.[dateName]} />
        </CardContent>
      </Card>

      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {changing ? (
          <Link
            href={routes.parentAllowance(childId)}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {allowanceFormCopy.cancel}
          </Link>
        ) : null}
        <Button type="submit" size="lg" loading={pending}>
          {allowanceFormCopy.save}
        </Button>
      </div>
    </form>
  );
}

/**
 * The planned Spend/Save split: share chips (`share` is not a schema field), the Save amount
 * (`save`; typing it leaves the chips), and the two parts as a bar and a line once both parse.
 */
function SplitField({
  currency,
  amountMinor,
  share,
  saveText,
  onShare,
  onSaveText,
  errors,
}: {
  currency: string;
  amountMinor: number | null;
  share: number | null;
  saveText: string;
  onShare: (share: number) => void;
  onSaveText: (text: string) => void;
  errors?: string[];
}) {
  const saveMinor = parseMoney(saveText, currency);
  const split =
    amountMinor !== null && amountMinor > 0 && saveMinor !== null && saveMinor <= amountMinor
      ? scheduleSplit(amountMinor, saveMinor)
      : null;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const width = (minor: number) => `${(minor / (amountMinor ?? 1)) * 100}%`;
  return (
    <Card className="rise-in" style={{ "--rise-index": 1 } as CSSProperties}>
      <CardContent className="grid gap-4">
        <ChoiceChips
          name="share"
          legend={allowanceFormCopy.split}
          options={SAVE_SHARES.map((value) => ({
            value: String(value),
            label: allowanceFormCopy.shareLabel(value),
          }))}
          value={share === null ? "" : String(share)}
          onValueChange={(value) => onShare(Number(value))}
        />
        <p className="text-ink-2 text-sm">{allowanceFormCopy.splitHint}</p>
        <Field
          name="save"
          label={allowanceFormCopy.saveAmount}
          inputMode="decimal"
          autoComplete="off"
          value={saveText}
          onChange={(event) => onSaveText(event.target.value)}
          errors={errors}
        />
        {split ? (
          <div className="grid gap-2">
            <div aria-hidden className="flex h-3 overflow-hidden rounded-full bg-muted">
              <div className="bg-teal-600" style={{ width: width(split.cash) }} />
              <div className="bg-gold-300" style={{ width: width(split.saved) }} />
            </div>
            <p aria-live="polite" className="text-ink-2 text-sm">
              {allowanceFormCopy.splitLine(money(split.cash), money(split.saved))}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
