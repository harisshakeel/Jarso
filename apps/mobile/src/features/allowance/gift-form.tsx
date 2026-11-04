import { type Gift, giftCopy, giftSchema, updateGiftSchema } from "@jarso/core/allowance";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { z } from "zod";
import { Card } from "@/components/screen";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, DateField, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { actionErrorMessage, addDays, flash, isAppError, toMajorString } from "@/lib";
import { useCancelGift, useCreateGift, useUpdateGift } from "./use-allowance-mutations";

type FieldErrors = { amount?: string[]; giveOn?: string[]; note?: string[] };

/**
 * A one-time gift (the web's GiftForm): amount, the day to give it and an optional note. New
 * when `initial` is absent (one idempotency key per opening), else a change to a pending gift,
 * which may keep a due gift's past date.
 */
export function GiftForm({
  childId,
  nickname,
  currency,
  today,
  initial,
  defaultAmount,
  onDone,
}: {
  childId: string;
  nickname: string;
  currency: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
  /** A pending gift to change. */
  initial?: Gift;
  /** Amount carried over from the allowance form, as the parent typed it. */
  defaultAmount?: string;
  /** After a save, with the gift and the day it's given on. */
  onDone: (saved: { giftId: string; giveOn: string }) => void;
}) {
  const create = useCreateGift();
  const update = useUpdateGift();
  const once = useSendOnce();
  // One key per opening: saving again after an error reuses it, so a lost reply makes one gift.
  const [idempotencyKey] = useState(() => randomUUID());
  const [amount, setAmount] = useState(
    initial ? toMajorString(initial.amountMinor, currency) : (defaultAmount ?? ""),
  );
  const [giveOn, setGiveOn] = useState(initial?.giveOn ?? today);
  const [note, setNote] = useState(initial?.note ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [error, setError] = useState<string>();
  const pending = create.isPending || update.isPending;

  const submit = () =>
    once(async () => {
      setError(undefined);
      const parsed = initial
        ? updateGiftSchema(currency, today).safeParse({ giftId: initial.id, amount, giveOn, note })
        : giftSchema(currency, today).safeParse({ childId, amount, giveOn, note, idempotencyKey });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error as z.ZodError).fieldErrors as FieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        let saved: { giftId: string; giveOn: string };
        if ("giftId" in parsed.data) {
          await update.mutateAsync({ childId, today, ...parsed.data });
          saved = { giftId: parsed.data.giftId, giveOn: parsed.data.giveOn };
        } else {
          // The stored date: a retry after a lost reply returns the gift it already made.
          saved = await create.mutateAsync(parsed.data);
        }
        flash(giftCopy.saved);
        onDone(saved);
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
          label={giftCopy.amount}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          autoComplete="off"
          errors={fieldErrors?.amount}
        />
      </Card>
      <Card className="gap-4">
        <DateField
          label={giftCopy.giveOn}
          value={giveOn}
          onChange={setGiveOn}
          minimumDate={initial ? undefined : today}
          maximumDate={addDays(today, 366)}
          errors={fieldErrors?.giveOn}
        />
        <Field
          label={giftCopy.noteLabel(nickname)}
          value={note}
          onChangeText={setNote}
          maxLength={140}
          autoComplete="off"
          errors={fieldErrors?.note}
        />
      </Card>

      <Notice message={error} />
      <Button
        size="lg"
        accessibilityLabel={giftCopy.save}
        accessibilityState={{ busy: pending, disabled: pending }}
        disabled={pending}
        onPress={() => void submit()}
      >
        {pending ? <ActivityIndicator color="white" /> : <Text>{giftCopy.save}</Text>}
      </Button>
    </View>
  );
}

/** "Cancel this gift", behind a confirmation. */
export function CancelGiftButton({
  childId,
  giftId,
  nickname,
  onDone,
}: {
  childId: string;
  giftId: string;
  nickname: string;
  /** Called before the refetch drops the gift, so the screen goes back without "already done". */
  onDone: () => void;
}) {
  const cancel = useCancelGift();
  const once = useSendOnce();
  const [error, setError] = useState<string>();

  const onPress = () =>
    Alert.alert(giftCopy.cancelTitle, giftCopy.cancelBody(nickname), [
      { text: giftCopy.keep, style: "cancel" },
      {
        text: giftCopy.cancel,
        style: "destructive",
        onPress: () =>
          void once(async () => {
            setError(undefined);
            try {
              await cancel.mutateAsync({ childId, giftId });
              flash(giftCopy.cancelled);
              onDone();
            } catch (cause) {
              setError(await actionErrorMessage(cause));
            }
          }),
      },
    ]);

  return (
    <View className="gap-2">
      <Notice message={error} />
      <Button
        variant="outline"
        size="lg"
        accessibilityLabel={giftCopy.cancelTrigger}
        accessibilityState={{ busy: cancel.isPending, disabled: cancel.isPending }}
        disabled={cancel.isPending}
        onPress={onPress}
      >
        <Text>{giftCopy.cancelTrigger}</Text>
      </Button>
    </View>
  );
}
