import { quickChips } from "@jarso/core/home";
import { askCelebration, askFlowCopy, depositMessage, depositSchema } from "@jarso/core/requests";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { Jarso } from "@/components/brand";
import type { CelebrationChip } from "@/components/celebrate";
import { HomeWait, Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { AmountKeypad, FlowShell, SentCelebration, useSparkChips } from "@/features/flows";
import { JarsoGuess, useGoal } from "@/features/goals";
import { useHome } from "@/features/jars";
import { useParentLabel } from "@/features/progress";
import { actionErrorMessage, formatMoney, parseMoney } from "@/lib";
import { useCreateDeposit } from "./use-request-mutations";

/** One of the two small jars under the title: Jarso, its name and what it will hold. */
function JarAmount({
  tint,
  name,
  amount,
  fill,
}: {
  tint: "spend" | "save";
  name: string;
  amount: string;
  fill: number;
}) {
  return (
    <View accessible accessibilityLabel={`${name} ${amount}`} className="items-center gap-1">
      <Jarso size={88} tint={tint} fill={fill} mood="happy" />
      <Text className="text-small text-muted-foreground">{name}</Text>
      <Text className="font-sans-extrabold text-h3">{amount}</Text>
    </View>
  );
}

/**
 * "Save some": move money from Spend into Save, on one screen. The two jars update as the amount
 * is typed; the button says the real action (hand the cash to your parent). Mount it once per
 * opening: the idempotency key is made on mount, reused by every retry and new the next time.
 */
export function PutInSheet({ onClose }: { onClose: () => void }) {
  const home = useHome();
  const goal = useGoal();
  const parent = useParentLabel();
  const router = useRouter();
  const [idempotencyKey] = useState(() => randomUUID());
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [sent, setSent] = useState<{
    status: "pending" | "confirmed" | "done" | "already_sent";
    chips: CelebrationChip[];
  }>();
  const send = useCreateDeposit();
  const once = useSendOnce();
  const sparks = useSparkChips();
  const currency = home.data?.context.currency;
  if (!home.data || !currency) return <HomeWait error={home.error} onClose={onClose} />;
  const { availability } = home.data;

  const copy = askFlowCopy(parent).deposit;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const amountMinor = parseMoney(amount, currency);
  const x = amountMinor ?? 0;
  const spendAfter = Math.max(availability.availableSpendMinor - x, 0);
  const saveAfter = availability.saveMinor + x;
  const total = availability.availableSpendMinor + availability.saveMinor;
  const unreached = goal.data && !goal.data.progress.reached ? goal.data : null;

  function submit() {
    return once(async () => {
      setNotice(undefined);
      const parsed = depositSchema(currency as string).safeParse({ amount, idempotencyKey });
      if (!parsed.success) {
        setAmountError(
          (z.flattenError(parsed.error).fieldErrors as { amount?: string[] }).amount?.[0],
        );
        return;
      }
      setAmountError(undefined);
      try {
        sparks.snapshot();
        const result = await send.mutateAsync({
          amountMinor: parsed.data.amountMinor,
          idempotencyKey: parsed.data.idempotencyKey,
        });
        if (result.status === "over_available") {
          return setNotice(depositMessage(result, currency as string));
        }
        setSent({ status: result.status, chips: await sparks.chips() });
      } catch (error) {
        setNotice(await actionErrorMessage(error));
      }
    });
  }

  if (sent) {
    const message = askCelebration("deposit", sent.status, money(x), parent);
    return (
      <SentCelebration
        celebration={{
          title: message.title,
          subtitle: message.subtitle,
          tone: "gold",
          chips: sent.chips,
          primary: { label: "Nice", onPress: onClose },
          secondary: message.tracked
            ? { label: "Track it", onPress: () => router.replace("/(child)/requests") }
            : undefined,
        }}
      />
    );
  }

  const label = amountMinor ? copy.button(money(amountMinor)) : copy.title;
  return (
    <FlowShell
      title={copy.title}
      onClose={onClose}
      footer={
        <Button
          variant="keycap-gold"
          size="lg"
          accessibilityLabel={label}
          accessibilityState={{ busy: send.isPending, disabled: send.isPending }}
          disabled={send.isPending}
          onPress={() => void submit()}
        >
          {send.isPending ? <ActivityIndicator color="white" /> : <Text>{label}</Text>}
        </Button>
      }
    >
      <View className="flex-row justify-around">
        <JarAmount
          tint="spend"
          name="Spend"
          amount={money(spendAfter)}
          fill={total > 0 ? spendAfter / total : 0}
        />
        <JarAmount
          tint="save"
          name="Save"
          amount={money(saveAfter)}
          fill={total > 0 ? saveAfter / total : 0}
        />
      </View>
      <AmountKeypad
        value={amount}
        onChange={(value) => {
          setAmount(value);
          setAmountError(undefined);
        }}
        currency={currency}
        chips={quickChips(currency, availability.availableSpendMinor)}
        limit={copy.limit(money(availability.availableSpendMinor))}
        error={amountError}
      />
      {unreached ? (
        <JarsoGuess
          move="put_in"
          amountMinor={amountMinor}
          goal={unreached.goal}
          saveMinor={availability.saveMinor}
          reservedMinor={availability.reservedSaveMinor}
        />
      ) : null}
      <Notice message={notice} />
    </FlowShell>
  );
}
