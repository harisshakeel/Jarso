"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useActionState, useState } from "react";
import { toast } from "sonner";
import { ChoiceChips, FieldError, FormError } from "@/components/form";
import { Button, buttonVariants, Card, CardContent, Input, Label } from "@/components/ui";
import { routes } from "@/config";
import { type ActionState, addDays, idle } from "@/lib";
import { describeSchedule, formatDay, toMajorString } from "../describe";
import { changeAllowanceAction, createAllowanceAction } from "../server/actions";
import { type Frequency, frequencies, type Schedule } from "../types";
import { AmountField } from "./amount-field";

const ONE_TIME = "one_time";

const frequencyLabels: Record<Frequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  annual: "Yearly",
};

type AllowanceFormProps = {
  childId: string;
  currency: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
  /** Present when changing a running or paused allowance. */
  initial?: Schedule;
};

/** Set up an allowance, or change the amount and how often (when `initial` is given). */
export function AllowanceForm({ childId, currency, today, initial }: AllowanceFormProps) {
  const router = useRouter();
  const changing = initial !== undefined;
  const [state, action, pending] = useActionState(
    async (_prev: ActionState<unknown>, formData: FormData) => {
      const result = changing
        ? await changeAllowanceAction(null, formData)
        : await createAllowanceAction(null, formData);
      if (result.ok) {
        toast.success("Allowance saved");
        // A change goes back to the manage page; a new allowance to the child's page.
        router.push(changing ? routes.parentAllowance(childId) : routes.parentChild(childId));
      }
      return result;
    },
    idle,
  );
  // Controlled so they survive a failed submit (React resets uncontrolled fields).
  const [amount, setAmount] = useState(initial ? toMajorString(initial.amountMinor, currency) : "");
  const [frequency, setFrequency] = useState<string>(initial?.frequency ?? "weekly");
  const [date, setDate] = useState(initial?.nextDueOn ?? today);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  const options = [
    ...frequencies.map((value) => ({ value, label: frequencyLabels[value] })),
    ...(changing ? [] : [{ value: ONE_TIME, label: "One time" }]),
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
      <Card className="rise-in" style={{ "--rise-index": 1 } as CSSProperties}>
        <CardContent>
          <ChoiceChips
            name="frequency"
            legend="How often"
            options={options}
            value={frequency}
            onValueChange={chooseFrequency}
          />
          <FieldError errors={fieldErrors?.frequency} />
        </CardContent>
      </Card>
      <Card className="rise-in" style={{ "--rise-index": 2 } as CSSProperties}>
        <CardContent className="grid gap-2">
          <Label htmlFor={dateName}>{changing ? "Next one on" : "First one on"}</Label>
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
              Paused until {formatDay(pausedThrough)}, so pick a date after that.
            </p>
          ) : null}
          <FieldError errors={fieldErrors?.[dateName]} />
        </CardContent>
      </Card>

      <FormError message={state?.ok === false && !fieldErrors ? state.error.message : undefined} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {changing ? (
          <Link
            href={routes.parentAllowance(childId)}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Cancel
          </Link>
        ) : null}
        <Button type="submit" size="lg" loading={pending}>
          Save allowance
        </Button>
      </div>
    </form>
  );
}
