import {
  allowanceFormCopy,
  allowanceSchema,
  changeAllowanceSchema,
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
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { z } from "zod";
import { Card } from "@/components/screen";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, DateField, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import {
  actionErrorMessage,
  addDays,
  cn,
  flash,
  formatMoney,
  isAppError,
  parseMoney,
  toMajorString,
} from "@/lib";
import { useChangeAllowance, useCreateAllowance } from "./use-allowance-mutations";

type FieldErrors = {
  amount?: string[];
  save?: string[];
  frequency?: string[];
  firstOn?: string[];
  nextOn?: string[];
};

/**
 * Set up an allowance, or change the amount, how often and the next date when `initial` is given
 * (the web's AllowanceForm). "One time" on a new allowance opens a new gift with the amount kept.
 * A date the database refuses lands on the date field. It also sets the planned Spend/Save split
 * (ADR 0019): a share of the amount, or a typed Save; Spend is the rest.
 */
export function AllowanceForm({
  childId,
  currency,
  today,
  initial,
  initialSaveShare = DEFAULT_SAVE_SHARE,
  onDone,
  onCancel,
}: {
  childId: string;
  currency: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
  /** A running or paused allowance to change. */
  initial?: Schedule;
  /** The Save share a new allowance (or one with no plan yet) starts at, in percent. */
  initialSaveShare?: number;
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
  // The split: a share of the amount (Save follows the amount), or null once Save is typed.
  const planned = initial?.saveMinor ?? null;
  const [share, setShare] = useState<number | null>(() =>
    initial && planned !== null
      ? shareOfSave(initial.amountMinor, planned, currency)
      : initialSaveShare,
  );
  const [typedSave, setTypedSave] = useState(
    planned !== null ? toMajorString(planned, currency) : "",
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [error, setError] = useState<string>();
  const pending = create.isPending || change.isPending;
  const amountMinor = parseMoney(amount, currency);
  const saveText =
    share === null
      ? typedSave
      : amountMinor === null
        ? ""
        : toMajorString(saveForShare(amountMinor, share, currency), currency);

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
            save: saveText,
          })
        : allowanceSchema(currency, today).safeParse({
            childId,
            amount,
            frequency,
            firstOn: date,
            save: saveText,
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
      <SplitField
        currency={currency}
        amountMinor={amountMinor}
        share={share}
        saveText={saveText}
        onShare={(value) => {
          setFieldErrors(undefined);
          setShare(value);
        }}
        onSaveText={(value) => {
          setFieldErrors(undefined);
          setShare(null);
          setTypedSave(value);
        }}
        errors={fieldErrors?.save}
      />
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
        variant="keycap"
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

/**
 * The planned Spend/Save split, inside the allowance form: share chips, the Save amount (typing
 * it leaves the chips), and the two parts as a bar and a line once both parse.
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
  return (
    <Card>
      <Text className="font-sans-semibold">{allowanceFormCopy.split}</Text>
      <Text className="text-muted-foreground">{allowanceFormCopy.splitHint}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={allowanceFormCopy.split}
        className="flex-row flex-wrap gap-2"
      >
        {SAVE_SHARES.map((value) => (
          <ChoiceChip
            key={value}
            label={allowanceFormCopy.shareLabel(value)}
            checked={share === value}
            onPress={() => onShare(value)}
          />
        ))}
      </View>
      <Field
        label={allowanceFormCopy.saveAmount}
        value={saveText}
        onChangeText={onSaveText}
        keyboardType="decimal-pad"
        autoComplete="off"
        errors={errors}
      />
      {split ? (
        <View className="gap-1.5">
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-3 flex-row overflow-hidden rounded-full bg-muted"
          >
            <View
              className="bg-primary"
              style={{ width: `${(split.cash / (amountMinor ?? 1)) * 100}%` }}
            />
            <View
              className="bg-gold"
              style={{ width: `${(split.saved / (amountMinor ?? 1)) * 100}%` }}
            />
          </View>
          <Text accessibilityLiveRegion="polite" className="text-muted-foreground">
            {allowanceFormCopy.splitLine(money(split.cash), money(split.saved))}
          </Text>
        </View>
      ) : null}
    </Card>
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
