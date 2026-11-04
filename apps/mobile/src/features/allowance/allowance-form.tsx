import {
  allowanceFormCopy,
  allowanceSchema,
  changeAllowanceSchema,
  describeSchedule,
  type Frequency,
  formatDay,
  frequencies,
  type Schedule,
} from "@jarso/core/allowance";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { z } from "zod";
import { Card } from "@/components/screen";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, DateField, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { actionErrorMessage, addDays, cn, flash, isAppError, toMajorString } from "@/lib";
import { useChangeAllowance, useCreateAllowance } from "./use-allowance-mutations";

type FieldErrors = {
  amount?: string[];
  frequency?: string[];
  firstOn?: string[];
  nextOn?: string[];
};

/**
 * Set up an allowance, or change the amount, how often and the next date when `initial` is given
 * (the web's AllowanceForm). "One time" on a new allowance opens a new gift with the amount kept.
 * A date the database refuses lands on the date field.
 */
export function AllowanceForm({
  childId,
  currency,
  today,
  initial,
  onDone,
  onCancel,
}: {
  childId: string;
  currency: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
  /** A running or paused allowance to change. */
  initial?: Schedule;
  onDone: () => void;
  /** Shown as Cancel while changing. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const changing = initial !== undefined;
  const create = useCreateAllowance();
  const change = useChangeAllowance();
  const once = useSendOnce();
  const [amount, setAmount] = useState(initial ? toMajorString(initial.amountMinor, currency) : "");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "weekly");
  const [date, setDate] = useState(initial?.nextDueOn ?? today);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [error, setError] = useState<string>();
  const pending = create.isPending || change.isPending;

  const dateName = changing ? "nextOn" : "firstOn";
  // Paused through a date: the next one has to come after the pause (the database refuses it).
  const pausedThrough =
    initial?.status === "paused" && initial.pausedThrough && initial.pausedThrough >= today
      ? initial.pausedThrough
      : null;
  const minDate = pausedThrough ? addDays(pausedThrough, 1) : today;

  function chooseOneTime() {
    const typed = amount.trim();
    router.push({
      pathname: "/(parent)/children/[childId]/gifts/new",
      params: typed ? { childId, amount: typed } : { childId },
    });
  }

  const submit = () =>
    once(async () => {
      setError(undefined);
      const parsed = initial
        ? changeAllowanceSchema(currency, today).safeParse({
            scheduleId: initial.id,
            amount,
            frequency,
            nextOn: date,
          })
        : allowanceSchema(currency, today).safeParse({
            childId,
            amount,
            frequency,
            firstOn: date,
          });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error as z.ZodError).fieldErrors as FieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        if ("scheduleId" in parsed.data) {
          await change.mutateAsync({ childId, ...parsed.data });
        } else {
          await create.mutateAsync(parsed.data);
        }
        flash(allowanceFormCopy.saved);
        onDone();
      } catch (cause) {
        if (isAppError(cause) && cause.fieldErrors) {
          setFieldErrors(cause.fieldErrors as FieldErrors);
          return;
        }
        setError(await actionErrorMessage(cause));
      }
    });

  return (
    <View className="gap-4">
      <Card>
        <Field
          label={allowanceFormCopy.amount}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          autoComplete="off"
          errors={fieldErrors?.amount}
        />
      </Card>
      <Card>
        <Text className="font-sans-semibold">{allowanceFormCopy.howOften}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={allowanceFormCopy.howOften}
          className="flex-row flex-wrap gap-2"
        >
          {frequencies.map((value) => (
            <ChoiceChip
              key={value}
              label={allowanceFormCopy.frequencyLabels[value]}
              checked={frequency === value}
              onPress={() => setFrequency(value)}
            />
          ))}
          {changing ? null : (
            <ChoiceChip label={allowanceFormCopy.oneTime} checked={false} onPress={chooseOneTime} />
          )}
        </View>
        {fieldErrors?.frequency?.[0] ? (
          <Text className="text-destructive">{fieldErrors.frequency[0]}</Text>
        ) : null}
      </Card>
      <Card>
        <DateField
          label={changing ? allowanceFormCopy.nextOn : allowanceFormCopy.firstOn}
          value={date}
          onChange={setDate}
          minimumDate={minDate}
          maximumDate={addDays(today, 366)}
          description={date ? describeSchedule(frequency, date) : undefined}
          errors={fieldErrors?.[dateName]}
        />
        {pausedThrough ? (
          <Text className="text-muted-foreground">
            {allowanceFormCopy.pausedUntil(formatDay(pausedThrough))}
          </Text>
        ) : null}
      </Card>

      <Notice message={error} />
      <Button
        size="lg"
        accessibilityLabel={allowanceFormCopy.save}
        accessibilityState={{ busy: pending, disabled: pending }}
        disabled={pending}
        onPress={() => void submit()}
      >
        {pending ? <ActivityIndicator color="white" /> : <Text>{allowanceFormCopy.save}</Text>}
      </Button>
      {onCancel ? (
        <Button
          variant="outline"
          size="lg"
          accessibilityLabel={allowanceFormCopy.cancel}
          onPress={onCancel}
        >
          <Text>{allowanceFormCopy.cancel}</Text>
        </Button>
      ) : null}
    </View>
  );
}

/** A choice as a pill: one of a radio group. */
export function ChoiceChip({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      className={cn(
        "min-h-12 justify-center rounded-full border px-4",
        checked ? "border-primary bg-secondary" : "border-border bg-card",
      )}
    >
      <Text className="font-sans-semibold">{label}</Text>
    </Pressable>
  );
}
