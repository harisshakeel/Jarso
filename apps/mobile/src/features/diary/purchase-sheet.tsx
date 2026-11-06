import {
  DEFAULT_NAME_HINT,
  entrySavedMessage,
  NAME_HINTS,
  notEnoughSaveMessage,
  notEnoughSpendToUndoMessage,
  purchaseFlowCopy,
  purchaseSchema,
  undoneSpendMessage,
} from "@jarso/core/diary";
import { quickChips, spendPictures } from "@jarso/core/home";
import { SPEND_CATEGORIES } from "@jarso/core/ledger";
import { offlineCopy } from "@jarso/core/offline";
import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { useCelebrate } from "@/components/celebrate";
import { HomeWait } from "@/components/sheet";
import { Button, Input, Text } from "@/components/ui";
import { AmountKeypad, FlowShell, PictureGrid, useSparkChips } from "@/features/flows";
import { useHome } from "@/features/jars";
import { formatMoney, parseMoney, toUserMessage } from "@/lib";
import { removeItem } from "@/lib/outbox";
import { sentEntryId, useRecordPurchase } from "./use-record-purchase";
import { useUndo } from "./use-undo";

const NAME_LABEL = "Name it";

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
 * "I bought something": how much (keypad), on what (picture grid), then a celebration. It goes
 * through the phone's outbox, so offline it waits on the phone and sends itself later. Mount it
 * once per opening: the idempotency key is made on mount, reused by every retry and new the next
 * time it opens.
 */
export function PurchaseSheet({ onClose, initial, replaces }: PurchaseSheetProps) {
  const home = useHome();
  const currency = home.data?.context.currency;
  const [idempotencyKey] = useState(() => randomUUID());
  const [step, setStep] = useState<1 | 2>(1);
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
  const celebrate = useCelebrate();
  const sparks = useSparkChips();

  if (!currency) return <HomeWait error={home.error} onClose={onClose} />;

  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const categoryLabel = SPEND_CATEGORIES.find((c) => c.key === category)?.label;

  function next() {
    // The same schema as the send, so the message is the one the web shows.
    const parsed = purchaseSchema(currency as string).safeParse({
      amount,
      category: "other",
      label: "",
      idempotencyKey,
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    setFieldErrors(undefined);
    setStep(2);
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

  async function submit() {
    // A ref, not `isPending`: two taps in one frame both see the old render.
    if (sending.current || !currency) return;
    setRefused(undefined);
    setNotice(undefined);
    // Exactly what the web form posts: the outbox route parses it with this same schema.
    const payload = { amount, category: category ?? "", label, idempotencyKey };
    const parsed = purchaseSchema(currency).safeParse(payload);
    if (!parsed.success) {
      const errors = z.flattenError(parsed.error).fieldErrors as FieldErrors;
      setFieldErrors(errors);
      if (errors.amount) setStep(1);
      return;
    }
    setFieldErrors(undefined);
    sending.current = true;
    try {
      sparks.snapshot();
      const result = await record.mutateAsync(payload);
      switch (result.status) {
        case "sent": {
          if (replaces) await removeItem(replaces).catch(() => undefined);
          const entryId = sentEntryId(result);
          celebrate({
            title: purchaseFlowCopy.celebrate,
            subtitle: purchaseFlowCopy.celebrateSub(
              money(parsed.data.amountMinor),
              categoryLabel ?? "",
            ),
            tone: "teal",
            mood: "cheer",
            sound: "coin",
            chips: await sparks.chips(),
            primary: { label: purchaseFlowCopy.nice, onPress: onClose },
            secondary: entryId
              ? { label: purchaseFlowCopy.undo, onPress: () => void takeBack(entryId) }
              : undefined,
          });
          return;
        }
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

  // Under the celebration: what is left once it closes (an undo's result, or just Done).
  if (record.data?.status === "sent") {
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text accessibilityLiveRegion="polite" className="font-sans-bold text-h3">
          {undone ?? entrySavedMessage}
        </Text>
        {undoError ? (
          <Text accessibilityRole="alert" className="text-primary">
            {undoError}
          </Text>
        ) : null}
        <Button size="lg" accessibilityLabel="Done" onPress={onClose}>
          <Text>Done</Text>
        </Button>
      </View>
    );
  }

  if (step === 1) {
    const available = home.data?.availability?.availableSpendMinor;
    const limit = typeof available === "number" ? available : null;
    const amountError = fieldErrors?.amount?.[0];
    return (
      <FlowShell
        title={purchaseFlowCopy.howMuch}
        step={1}
        steps={2}
        onClose={onClose}
        footer={
          <Button
            variant="keycap"
            size="lg"
            accessibilityLabel={purchaseFlowCopy.next}
            onPress={next}
          >
            <Text>{purchaseFlowCopy.next}</Text>
          </Button>
        }
      >
        <AmountKeypad
          value={amount}
          onChange={(value) => {
            setAmount(value);
            setFieldErrors(undefined);
          }}
          currency={currency}
          chips={quickChips(currency, limit)}
          limit={limit === null ? undefined : purchaseFlowCopy.spendHas(money(limit))}
          error={amountError}
        />
      </FlowShell>
    );
  }

  const labelError = fieldErrors?.label?.[0];
  const chosen = money(parseMoney(amount, currency) ?? 0);
  const doneLabel = purchaseFlowCopy.done(chosen, categoryLabel ?? "").trimEnd();
  return (
    <FlowShell
      title={purchaseFlowCopy.onWhat}
      step={2}
      steps={2}
      onBack={() => setStep(1)}
      onClose={onClose}
      footer={
        <Button
          variant="keycap"
          size="lg"
          accessibilityLabel={doneLabel}
          accessibilityState={{ busy: record.isPending, disabled: !category || record.isPending }}
          disabled={!category || record.isPending}
          onPress={() => void submit()}
        >
          {record.isPending ? <ActivityIndicator color="white" /> : <Text>{doneLabel}</Text>}
        </Button>
      }
    >
      <PictureGrid
        options={spendPictures()}
        value={category}
        onChange={setCategory}
        legend={purchaseFlowCopy.onWhat}
      />
      <Input
        accessibilityLabel={NAME_LABEL}
        value={label}
        onChangeText={setLabel}
        placeholder={purchaseFlowCopy.nameHint(
          (category && NAME_HINTS[category]) || DEFAULT_NAME_HINT,
        )}
        autoComplete="off"
        maxLength={60}
      />
      {labelError ? (
        <Text accessibilityLiveRegion="polite" className="text-primary">
          {labelError}
        </Text>
      ) : null}
      {refused ? (
        <Text accessibilityRole="alert" className="text-primary">
          {refused}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" className="rounded-lg bg-muted px-3.5 py-2.5">
          {notice}
        </Text>
      ) : null}
    </FlowShell>
  );
}
