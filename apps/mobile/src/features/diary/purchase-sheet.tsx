import {
  DEFAULT_NAME_HINT,
  entrySavedMessage,
  NAME_HINTS,
  notEnoughSaveMessage,
  notEnoughSpendToUndoMessage,
  purchaseSchema,
  undoneSpendMessage,
} from "@jarso/core/diary";
import { SPEND_CATEGORIES } from "@jarso/core/ledger";
import { offlineCopy } from "@jarso/core/offline";
import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { z } from "zod";
import { Button, Input, Label, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { toUserMessage } from "@/lib";
import { removeItem } from "@/lib/outbox";
import { CategoryChips } from "./category-chips";
import { sentEntryId, useRecordPurchase } from "./use-record-purchase";
import { useUndo } from "./use-undo";

const AMOUNT_LABEL = "Amount";
const NAME_LABEL = "Name it (optional)";

type FieldErrors = { amount?: string[]; label?: string[] };

/** What the form starts with when a purchase that needs a look is being changed. */
export type PurchaseDraft = { amount: string; label: string; category?: string };

type PurchaseSheetProps = {
  onClose: () => void;
  /** Prefills the fields ("Change it" on a purchase that needs a look). */
  initial?: PurchaseDraft;
  /** The outbox id of the purchase being changed: it goes once the new one is sent or stored. */
  replaces?: string;
};

/**
 * "Spent something?": amount, what it was for, an optional name. It goes through the phone's
 * outbox, so offline it waits on the phone and sends itself later. Mount it once per opening:
 * the idempotency key is made on mount, reused by every retry and new the next time it opens.
 */
export function PurchaseSheet({ onClose, initial, replaces }: PurchaseSheetProps) {
  const home = useHome();
  const currency = home.data?.context.currency;
  const [idempotencyKey] = useState(() => randomUUID());
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  // A purchase saved before categories existed has none, so it starts unpicked.
  const [category, setCategory] = useState<string | null>(
    SPEND_CATEGORIES.some((c) => c.key === initial?.category) ? (initial?.category ?? null) : null,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [refused, setRefused] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [undone, setUndone] = useState<string>();
  const [undoError, setUndoError] = useState<string>();
  const sending = useRef(false);
  const record = useRecordPurchase();
  const undo = useUndo();

  if (!currency) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        {home.error ? (
          <>
            <Text accessibilityRole="alert" className="text-center">
              {toUserMessage(home.error)}
            </Text>
            <Button accessibilityLabel="Close" onPress={onClose}>
              <Text>Close</Text>
            </Button>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading" />
        )}
      </View>
    );
  }

  async function submit() {
    // A ref, not `isPending`: two taps in one frame both see the old render.
    if (sending.current || !currency) return;
    setRefused(undefined);
    setNotice(undefined);
    // Exactly what the web form posts: the outbox route parses it with this same schema.
    const payload = { amount, category: category ?? "", label, idempotencyKey };
    const parsed = purchaseSchema(currency).safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    setFieldErrors(undefined);
    sending.current = true;
    try {
      const result = await record.mutateAsync(payload);
      switch (result.status) {
        case "sent":
        case "queued":
          if (replaces) await removeItem(replaces).catch(() => undefined);
          return;
        case "refused":
          return setRefused(result.message);
        case "unsaved":
          return setNotice(offlineCopy.offline);
        case "unsent":
          return setNotice(offlineCopy.slow);
      }
    } finally {
      sending.current = false;
    }
  }

  async function takeBack(entryId: string) {
    setUndoError(undefined);
    try {
      const result = await undo.mutateAsync(entryId);
      if (result === "not_enough_spend") return setUndoError(notEnoughSpendToUndoMessage);
      if (result === "not_enough_save") return setUndoError(notEnoughSaveMessage);
      setUndone(undoneSpendMessage);
    } catch (error) {
      setUndoError(toUserMessage(error));
    }
  }

  if (record.data?.status === "queued") {
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text accessibilityLiveRegion="polite" className="font-sans-bold text-h3">
          {offlineCopy.waiting}
        </Text>
        <Button size="lg" accessibilityLabel="Done" onPress={onClose}>
          <Text>Done</Text>
        </Button>
      </View>
    );
  }

  const saved = record.data?.status === "sent" ? record.data : undefined;
  if (saved) {
    const entryId = sentEntryId(saved);
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text accessibilityLiveRegion="polite" className="font-sans-bold text-h3">
          {undone ?? entrySavedMessage}
        </Text>
        {undone || !entryId ? null : (
          <Button
            variant="outline"
            size="lg"
            accessibilityLabel="Undo"
            accessibilityState={{ busy: undo.isPending, disabled: undo.isPending }}
            disabled={undo.isPending}
            onPress={() => void takeBack(entryId)}
          >
            {undo.isPending ? <ActivityIndicator /> : <Text>Undo</Text>}
          </Button>
        )}
        {undoError ? (
          <Text accessibilityRole="alert" className="text-destructive">
            {undoError}
          </Text>
        ) : null}
        <Button size="lg" accessibilityLabel="Done" onPress={onClose}>
          <Text>Done</Text>
        </Button>
      </View>
    );
  }

  const amountError = fieldErrors?.amount?.[0];
  const labelError = fieldErrors?.label?.[0];
  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-6 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          What did you spend?
        </Text>
        <Text className="text-muted-foreground">It comes out of your Spend jar.</Text>
      </View>
      <View className="gap-2">
        <Label nativeID="purchase-amount-label">{AMOUNT_LABEL}</Label>
        <Input
          accessibilityLabel={AMOUNT_LABEL}
          aria-labelledby="purchase-amount-label"
          aria-invalid={Boolean(amountError)}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          autoComplete="off"
          className={amountError ? "h-14 border-destructive text-3xl" : "h-14 text-3xl"}
        />
        {amountError ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">
            {amountError}
          </Text>
        ) : null}
      </View>
      <CategoryChips
        options={SPEND_CATEGORIES}
        value={category}
        onChange={setCategory}
        legend="What was it for?"
      />
      <View className="gap-2">
        <Label nativeID="purchase-label-label">{NAME_LABEL}</Label>
        <Input
          accessibilityLabel={NAME_LABEL}
          aria-labelledby="purchase-label-label"
          value={label}
          onChangeText={setLabel}
          placeholder={(category && NAME_HINTS[category]) || DEFAULT_NAME_HINT}
          autoComplete="off"
          maxLength={60}
        />
        {labelError ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">
            {labelError}
          </Text>
        ) : null}
      </View>
      {refused ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {refused}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" className="rounded-lg bg-muted px-3.5 py-2.5">
          {notice}
        </Text>
      ) : null}
      <View className="gap-2">
        <Button
          size="lg"
          accessibilityLabel="Write it down"
          accessibilityState={{ busy: record.isPending, disabled: !category || record.isPending }}
          disabled={!category || record.isPending}
          onPress={() => void submit()}
        >
          {record.isPending ? <ActivityIndicator color="white" /> : <Text>Write it down</Text>}
        </Button>
        {category ? null : (
          <Text className="text-center text-muted-foreground">Pick what it was for</Text>
        )}
      </View>
    </ScrollView>
  );
}
