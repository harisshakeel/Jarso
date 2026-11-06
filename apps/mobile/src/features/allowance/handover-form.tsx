import {
  cashForSaved,
  checkSplit,
  type DueItem,
  formatDay,
  handoverCopy,
  handoverSchema,
  prefillSplit,
  type Split,
} from "@jarso/core/allowance";
import { familyCardsCopy } from "@jarso/core/dashboard";
import { planNote } from "@jarso/core/goals";
import type { JarsoLook } from "@jarso/core/mascot";
import { parentRequestCopy } from "@jarso/core/requests";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { z } from "zod";
import { Jarso } from "@/components/brand";
import { Card, KeyboardScrollView } from "@/components/screen";
import { HomeWait, Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { useChildProgress, useFamily } from "@/features/family";
import { CardPaymentSlot, usePaymentProviders } from "@/features/payments";
import { actionErrorMessage, flash, formatMoney, parseMoney, toMajorString } from "@/lib";
import { useChildDue } from "./use-due";
import { useChildGoal, useConfirmHandover, useLastSplit, useMarkNotGiven } from "./use-handover";

type Kind = "allowance" | "gift";

/** The longest the handover waits for the optional card block before opening without it. */
const CARD_WAIT_MS = 3_000;
type FieldErrors = { cash?: string[]; saved?: string[] };

/**
 * The handover sheet (the web's handover page): the due item, read fresh, then the cash and
 * saved form. An item no longer due says "Already sorted." and closes. Mount it once per
 * opening: the form's idempotency key is made on mount.
 */
export function HandoverSheet({
  childId,
  kind,
  id,
  onClose,
}: {
  childId: string;
  kind: Kind;
  id: string;
  onClose: () => void;
}) {
  const family = useFamily();
  const due = useChildDue(childId);
  const last = useLastSplit(childId);
  const goal = useChildGoal(childId);
  // The child's Jarso look, a nice-to-have: the form never waits for it.
  const progress = useChildProgress(childId);
  // The card block's read, started with the others so the form opens with the block in place
  // rather than pushing Confirm down when it lands. Each opening waits for its own read, even
  // with an earlier opening's answer cached (cards may have come on, or a payment gone pending),
  // but only until the form is up: a failed read, which the slot fetches again on mount, or a
  // paused, offline one opens it anyway.
  // The block is optional, so a slow read is waited for only briefly (the request timeout and its
  // retry would hold the spinner for half a minute); it then lands in the slot when it can.
  const card = usePaymentProviders({ childId, kind, id });
  const [shown, setShown] = useState(false);
  const [cardWaitOver, setCardWaitOver] = useState(false);
  const cardLoading = !shown && !cardWaitOver && card.fetchStatus === "fetching";

  useEffect(() => {
    const timer = setTimeout(() => setCardWaitOver(true), CARD_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  // Set once this sheet wrote: the refetch that follows must not read as "already sorted".
  const finished = useRef(false);
  const child = family.data?.children.find((c) => c.id === childId);
  const item = due.data?.find((d) => d.kind === kind && d.id === id);
  // A due list still refetching may predate the item (a gift just made): wait for the fresh one.
  const gone = Boolean((family.data && !child) || (due.data && !due.isFetching && !item));

  useEffect(() => {
    if (!gone || finished.current) return;
    finished.current = true;
    flash(parentRequestCopy.settled);
    onClose();
  }, [gone, onClose]);

  if (!family.data || !child || !item || !last.isSuccess || cardLoading) {
    return <HomeWait error={family.error ?? due.error} onClose={onClose} />;
  }
  if (!shown) setShown(true);

  return (
    <HandoverForm
      childId={childId}
      nickname={child.nickname}
      currency={family.data.family.currency}
      item={item}
      prefill={prefillSplit(item.amountMinor, last.data)}
      goalNote={planNote(child.nickname, goal.data?.goal ?? null, family.data.family.currency)}
      look={progress.data?.look}
      onDone={() => {
        finished.current = true;
        onClose();
      }}
    />
  );
}

/** Cash to the child's Spend, the rest kept as Save (spec §5.2), with "Not given" for allowances. */
export function HandoverForm({
  childId,
  nickname,
  currency,
  item,
  prefill,
  goalNote,
  look,
  onDone,
}: {
  childId: string;
  nickname: string;
  currency: string;
  item: DueItem;
  prefill: Split;
  goalNote: string | null;
  /** The child's Jarso look; the default look until it has loaded. */
  look?: JarsoLook;
  onDone: () => void;
}) {
  const router = useRouter();
  const { kind, id, amountMinor } = item;
  const isAllowance = kind === "allowance";
  const confirm = useConfirmHandover();
  const notGiven = useMarkNotGiven();
  const once = useSendOnce();
  // One key per opening, kept across retries: the database makes it exactly once.
  const [idempotencyKey] = useState(() => randomUUID());
  const [cashText, setCashText] = useState(toMajorString(prefill.cash, currency));
  const [savedText, setSavedText] = useState(toMajorString(prefill.saved, currency));
  // Once the parent types Spend, typing Save no longer fills it in: their number stays.
  const [cashTyped, setCashTyped] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [error, setError] = useState<string>();

  const cash = parseMoney(cashText, currency);
  const saved = parseMoney(savedText, currency);
  const { valid, total, short, over } = checkSplit(cash, saved, amountMinor, kind);
  const amount = formatMoney(amountMinor, currency);
  const pending = confirm.isPending || notGiven.isPending;

  const cashError =
    cashText.trim() && cash === null ? handoverCopy.moneyError : fieldErrors?.cash?.[0];
  const savedError =
    savedText.trim() && saved === null ? handoverCopy.moneyError : fieldErrors?.saved?.[0];

  function typeCash(value: string) {
    setFieldErrors(undefined);
    setCashText(value);
    setCashTyped(true);
  }

  function typeSaved(value: string) {
    setFieldErrors(undefined);
    setSavedText(value);
    if (cashTyped) return;
    // Spend takes the rest of what was due, so the parent usually types one number.
    const rest = cashForSaved(parseMoney(value, currency), amountMinor);
    if (rest !== null) setCashText(toMajorString(rest, currency));
  }

  const submit = () =>
    once(async () => {
      setError(undefined);
      const parsed = handoverSchema(currency).safeParse({
        kind,
        id,
        cash: cashText,
        saved: savedText,
        idempotencyKey,
      });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
        return;
      }
      try {
        const result = await confirm.mutateAsync({ childId, ...parsed.data });
        flash(
          result === "confirmed" ? handoverCopy.handedOver(nickname) : handoverCopy.alreadyHandled,
        );
        onDone();
      } catch (cause) {
        setError(await actionErrorMessage(cause));
      }
    });

  const onNotGiven = () =>
    Alert.alert(handoverCopy.notGivenTitle, handoverCopy.notGivenBody(nickname), [
      { text: handoverCopy.goBack, style: "cancel" },
      {
        text: handoverCopy.notGiven,
        style: "destructive",
        onPress: () =>
          void once(async () => {
            setError(undefined);
            try {
              const result = await notGiven.mutateAsync({ childId, id });
              flash(
                result === "closed" ? handoverCopy.markedNotGiven : handoverCopy.alreadyHandled,
              );
              onDone();
            } catch (cause) {
              setError(await actionErrorMessage(cause));
            }
          }),
      },
    ]);

  const barBase = Math.max(amountMinor, total);
  const spendWidth = valid && cash !== null && barBase > 0 ? (cash / barBase) * 100 : 0;
  const saveWidth = valid && saved !== null && barBase > 0 ? (saved / barBase) * 100 : 0;

  return (
    <KeyboardScrollView
      className="bg-background"
      contentContainerClassName="gap-4 p-4 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <View className="items-center gap-1.5 pt-2">
        <Jarso mood="happy" size={88} look={look} />
        <Text accessibilityRole="header" className="text-center font-sans-extrabold text-h1">
          {familyCardsCopy.handoverTitle(amount, nickname)}
        </Text>
        <Text className="text-center text-muted-foreground">
          {item.note
            ? `${handoverCopy.heading(kind, formatDay(item.dueOn))} · ${item.note}`
            : handoverCopy.heading(kind, formatDay(item.dueOn))}
        </Text>
      </View>

      <Card className="gap-4 rounded-3xl">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="h-3 flex-row overflow-hidden rounded-full bg-muted"
        >
          <View className="bg-primary" style={{ width: `${spendWidth}%` }} />
          <View className="bg-gold" style={{ width: `${saveWidth}%` }} />
        </View>
        <Field
          label={handoverCopy.cashLabel(nickname)}
          value={cashText}
          onChangeText={typeCash}
          keyboardType="decimal-pad"
          autoComplete="off"
          errors={cashError ? [cashError] : undefined}
        />
        <Field
          label={handoverCopy.savedLabel}
          value={savedText}
          onChangeText={typeSaved}
          keyboardType="decimal-pad"
          autoComplete="off"
          errors={savedError ? [savedError] : undefined}
        />
        {goalNote ? <Text className="text-muted-foreground">{goalNote}</Text> : null}
        {over ? (
          <Text accessibilityLiveRegion="polite" className="text-destructive">
            {handoverCopy.over(amount)}
          </Text>
        ) : short > 0 ? (
          <Text accessibilityLiveRegion="polite" className="text-muted-foreground">
            {handoverCopy.shortLine(
              nickname,
              formatMoney(amountMinor - short, currency),
              formatMoney(short, currency),
            )}
          </Text>
        ) : isAllowance ? (
          <Text className="text-muted-foreground">{handoverCopy.gaveLess}</Text>
        ) : null}
      </Card>

      <CardPaymentSlot
        kind={kind}
        id={id}
        childId={childId}
        amountMinor={amountMinor}
        currency={currency}
        split={cash !== null && saved !== null ? { spendMinor: cash, saveMinor: saved } : undefined}
      />

      <Notice message={error} />
      <Button
        variant="keycap-gold"
        size="lg"
        accessibilityLabel={handoverCopy.confirm}
        accessibilityState={{ busy: confirm.isPending, disabled: pending || !valid || over }}
        disabled={pending || !valid || over}
        loading={confirm.isPending}
        onPress={() => void submit()}
      >
        <Text>{handoverCopy.confirm}</Text>
      </Button>
      {isAllowance ? (
        <Button
          variant="keycap-white"
          size="lg"
          accessibilityLabel={handoverCopy.notGiven}
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={onNotGiven}
        >
          <Text>{handoverCopy.notGiven}</Text>
        </Button>
      ) : (
        <Button
          variant="ghost"
          accessibilityLabel={handoverCopy.changeGift}
          onPress={() => router.push(`/(parent)/children/${childId}/gifts/${id}`)}
        >
          <Text>{handoverCopy.changeGift}</Text>
        </Button>
      )}
    </KeyboardScrollView>
  );
}
