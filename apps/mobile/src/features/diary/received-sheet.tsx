import {
  purchaseFlowCopy,
  receivedCopy,
  receivedFlowCopy,
  receivedSchema,
} from "@jarso/core/diary";
import { quickChips, receivedPictures } from "@jarso/core/home";
import { RECEIVED_CATEGORIES } from "@jarso/core/ledger";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { z } from "zod";
import { useCelebrate } from "@/components/celebrate";
import { HomeWait, useSendOnce } from "@/components/sheet";
import { Button, Input, Text } from "@/components/ui";
import { AmountKeypad, FlowShell, PictureGrid, useSparkChips } from "@/features/flows";
import { useGoal } from "@/features/goals";
import { useHome } from "@/features/jars";
import { useParentLabel } from "@/features/progress";
import { actionErrorMessage, cn, formatMoney, isAppError, parseMoney } from "@/lib";
import { useRecordReceived } from "./use-record-received";

type FieldErrors = { amount?: string[]; label?: string[] };
type Jar = "spend" | "save";

const NAME_LABEL = "Name it";

type JarChoiceProps = { value: Jar; onChange: (jar: Jar) => void; parent: string };

/** "Put it in": Spend or Save as two big picks. */
export function JarChoice({ value, onChange, parent }: JarChoiceProps) {
  const options: { value: Jar; label: string; hint: string }[] = [
    {
      value: "spend",
      label: receivedFlowCopy.spend.label,
      hint: receivedFlowCopy.spend.hint,
    },
    {
      value: "save",
      label: receivedFlowCopy.save.label,
      hint: receivedFlowCopy.save.hint(parent),
    },
  ];
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={receivedFlowCopy.putItIn}
      className="flex-row gap-2"
    >
      {options.map((option) => {
        const checked = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.hint}
            accessibilityState={{ checked }}
            onPress={() => onChange(option.value)}
            className={cn(
              "min-h-20 flex-1 justify-center gap-0.5 rounded-xl border-2 bg-card px-3 py-2",
              checked ? "border-primary" : "border-border",
            )}
          >
            <Text className="font-sans-bold text-h3">{option.label}</Text>
            <Text className="text-small text-muted-foreground">{option.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * "I got money": money from another source (a gift, a job, a find). It counts at once, no parent
 * approval; online only, like the web. Mount it once per opening: the idempotency key is made on
 * mount and reused by every retry.
 */
export function ReceivedSheet({ onClose }: { onClose: () => void }) {
  const home = useHome();
  const goal = useGoal();
  const parent = useParentLabel();
  const [idempotencyKey] = useState(() => randomUUID());
  const [step, setStep] = useState<1 | 2>(1);
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [jar, setJar] = useState<Jar>("spend");
  const [category, setCategory] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [refused, setRefused] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const record = useRecordReceived();
  const once = useSendOnce();
  const celebrate = useCelebrate();
  const sparks = useSparkChips();
  const currency = home.data?.context.currency;
  if (!currency) return <HomeWait error={home.error} onClose={onClose} />;

  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const amountMinor = parseMoney(amount, currency);

  function next() {
    const parsed = receivedSchema(currency as string).safeParse({
      amount,
      jar,
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

  function submit() {
    return once(async () => {
      setRefused(undefined);
      setNotice(undefined);
      const parsed = receivedSchema(currency as string).safeParse({
        amount,
        jar,
        category: category ?? "",
        label,
        idempotencyKey,
      });
      if (!parsed.success) {
        const errors = z.flattenError(parsed.error).fieldErrors as FieldErrors;
        setFieldErrors(errors);
        if (errors.amount) setStep(1);
        return;
      }
      setFieldErrors(undefined);
      try {
        sparks.snapshot();
        await record.mutateAsync({ ...parsed.data, label: parsed.data.label ?? "" });
      } catch (error) {
        const message = await actionErrorMessage(error);
        if (isAppError(error) && error.code === "UNAVAILABLE") setNotice(message);
        else setRefused(message);
        return;
      }
      const from = RECEIVED_CATEGORIES.find((c) => c.key === category)?.label ?? "";
      celebrate({
        title: purchaseFlowCopy.celebrate,
        subtitle: purchaseFlowCopy.celebrateSub(money(parsed.data.amountMinor), from),
        tone: "gold",
        sound: "coin",
        chips: await sparks.chips(),
        primary: { label: purchaseFlowCopy.nice, onPress: onClose },
      });
    });
  }

  // Under the celebration, whose button leaves the sheet.
  if (record.data) return <View className="flex-1 bg-background" />;

  if (step === 1) {
    return (
      <FlowShell
        title={receivedFlowCopy.howMuch}
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
          chips={quickChips(currency)}
          error={fieldErrors?.amount?.[0]}
        />
      </FlowShell>
    );
  }

  const labelError = fieldErrors?.label?.[0];
  const unreached = goal.data && !goal.data.progress.reached ? goal.data : null;
  const toGo =
    unreached && jar === "save" && amountMinor
      ? Math.max(unreached.progress.remainingMinor - amountMinor, 0)
      : null;
  const submitLabel = receivedFlowCopy.submit(jar === "save" ? "Save" : "Spend");
  return (
    <FlowShell
      title={receivedFlowCopy.got(money(amountMinor ?? 0))}
      step={2}
      steps={2}
      onBack={() => setStep(1)}
      onClose={onClose}
      footer={
        <Button
          variant="keycap"
          size="lg"
          accessibilityLabel={submitLabel}
          accessibilityState={{ busy: record.isPending, disabled: !category || record.isPending }}
          disabled={!category || record.isPending}
          onPress={() => void submit()}
        >
          {record.isPending ? <ActivityIndicator color="white" /> : <Text>{submitLabel}</Text>}
        </Button>
      }
    >
      <Text className="font-sans-bold">{receivedFlowCopy.from}</Text>
      <PictureGrid
        options={receivedPictures()}
        value={category}
        onChange={setCategory}
        legend={receivedFlowCopy.from}
      />
      <Text className="font-sans-bold">{receivedFlowCopy.putItIn}</Text>
      <JarChoice value={jar} onChange={setJar} parent={parent} />
      {unreached && toGo !== null ? (
        <Text accessibilityLiveRegion="polite" className="font-sans-bold text-secondary-foreground">
          {toGo === 0
            ? receivedFlowCopy.goalReached(unreached.goal.emoji, unreached.goal.name)
            : receivedFlowCopy.goalAfter(unreached.goal.emoji, unreached.goal.name, money(toGo))}
        </Text>
      ) : null}
      <Input
        accessibilityLabel={NAME_LABEL}
        value={label}
        onChangeText={setLabel}
        placeholder={purchaseFlowCopy.nameHint(receivedCopy.namePlaceholder)}
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
