import { entryDetailCopy, FALLBACK_LABELS, fixRefusalMessage, fixSchema } from "@jarso/core/diary";
import {
  categoryOf,
  type HistoryItem,
  RECEIVED_CATEGORIES,
  SPEND_CATEGORIES,
} from "@jarso/core/ledger";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { AmountInput, Notice, SubmitButton, useSendOnce } from "@/components/sheet";
import { Input, Label, Text } from "@/components/ui";
import { actionErrorMessage, isAppError, toMajorString } from "@/lib";
import { CategoryChips } from "./category-chips";
import { useFixEntry } from "./use-fix-entry";

type FieldErrors = { amount?: string[]; label?: string[] };

/**
 * Fix the amount, the category or the name of one line. No jar picker: a fix never moves money
 * between jars. Online only, like Undo. Mount it once per opening (its idempotency key).
 */
export function FixForm({
  item,
  currency,
  onDone,
}: {
  item: HistoryItem;
  currency: string;
  onDone: () => void;
}) {
  const kind = item.kind === "received" ? "received" : "purchase";
  const [idempotencyKey] = useState(() => randomUUID());
  const [amount, setAmount] = useState(toMajorString(item.amountMinor ?? 0, currency));
  const [label, setLabel] = useState(FALLBACK_LABELS.includes(item.label) ? "" : item.label);
  const [category, setCategory] = useState<string | null>(categoryOf(item.category, kind).key);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [refused, setRefused] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const fix = useFixEntry();
  const once = useSendOnce();

  function submit() {
    return once(async () => {
      setRefused(undefined);
      setNotice(undefined);
      const parsed = fixSchema(currency).safeParse({
        entryId: item.entryId ?? "",
        amount,
        category: category ?? "",
        label,
        idempotencyKey,
      });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        const outcome = await fix.mutateAsync({ ...parsed.data, label: parsed.data.label ?? "" });
        const message = fixRefusalMessage(outcome, kind, currency, item.amountMinor ?? 0);
        if (message === null) return onDone();
        if (outcome.status === "unchanged") setNotice(message);
        else setRefused(message);
      } catch (error) {
        const message = await actionErrorMessage(error);
        if (isAppError(error) && error.code === "UNAVAILABLE") setNotice(message);
        else setRefused(message);
      }
    });
  }

  return (
    <View className="gap-6">
      <AmountInput id="fix" value={amount} onChange={setAmount} error={fieldErrors?.amount?.[0]} />
      <CategoryChips
        options={kind === "received" ? RECEIVED_CATEGORIES : SPEND_CATEGORIES}
        value={category}
        onChange={setCategory}
        legend={
          kind === "received"
            ? entryDetailCopy.receivedCategoryLegend
            : entryDetailCopy.purchaseCategoryLegend
        }
      />
      <View className="gap-2">
        <Label nativeID="fix-label-label">{entryDetailCopy.nameLabel}</Label>
        <Input
          accessibilityLabel={entryDetailCopy.nameLabel}
          aria-labelledby="fix-label-label"
          value={label}
          onChangeText={setLabel}
          autoComplete="off"
          maxLength={60}
        />
        {fieldErrors?.label?.[0] ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">
            {fieldErrors.label[0]}
          </Text>
        ) : null}
      </View>
      <Text className="text-muted-foreground text-sm">{entryDetailCopy.jarsHint}</Text>
      <Notice message={refused} />
      {notice ? (
        <Text accessibilityLiveRegion="polite" className="rounded-lg bg-muted px-3.5 py-2.5">
          {notice}
        </Text>
      ) : null}
      <SubmitButton
        label={entryDetailCopy.saveFix}
        pending={fix.isPending}
        disabled={!category}
        onPress={() => void submit()}
      />
    </View>
  );
}
