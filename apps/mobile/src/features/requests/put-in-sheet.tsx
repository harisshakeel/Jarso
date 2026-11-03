import { depositMessage, depositSchema } from "@jarso/core/requests";
import { describeRuleForChild, jarMovesLineForChild } from "@jarso/core/rules";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { z } from "zod";
import { Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { actionErrorMessage, formatMoney } from "@/lib";
import {
  AmountInput,
  HomeWait,
  Notice,
  RuleLines,
  SentView,
  SubmitButton,
  useSendOnce,
} from "./sheet-parts";
import { useChildRules, useCreateDeposit } from "./use-request-mutations";

/**
 * "Put money into Save": move money from Spend into Save. Mount it once per opening: the
 * idempotency key is made on mount, reused by every retry and new the next time it opens.
 */
export function PutInSheet({ onClose }: { onClose: () => void }) {
  const home = useHome();
  const rules = useChildRules();
  const [idempotencyKey] = useState(() => randomUUID());
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const send = useCreateDeposit();
  const once = useSendOnce();
  const currency = home.data?.context.currency;
  if (!home.data || !currency) return <HomeWait error={home.error} onClose={onClose} />;
  const { availability } = home.data;

  const ruleLines = [
    ...(rules.data
      ? [
          jarMovesLineForChild(rules.data.jarMovesApproval),
          ...rules.data.rules
            .filter((rule) => rule.kind === "deposit_auto_confirm")
            .map((rule) => describeRuleForChild(rule, currency)),
        ].filter((line): line is string => line !== null)
      : []),
  ];

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
        const result = await send.mutateAsync({
          amountMinor: parsed.data.amountMinor,
          idempotencyKey: parsed.data.idempotencyKey,
        });
        if (result.status === "over_available") {
          setNotice(depositMessage(result, currency as string));
        }
      } catch (error) {
        setNotice(await actionErrorMessage(error));
      }
    });
  }

  if (send.data && send.data.status !== "over_available") {
    return <SentView message={depositMessage(send.data, currency)} onClose={onClose} />;
  }

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-6 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          Put money into Save
        </Text>
        <Text className="text-muted-foreground">
          Spend has{" "}
          {formatMoney(availability.availableSpendMinor, currency, { showMinor: "nonzero" })}
        </Text>
      </View>
      <RuleLines lines={ruleLines} />
      <AmountInput id="put-in" value={amount} onChange={setAmount} error={amountError} />
      <Notice message={notice} />
      <SubmitButton label="Put in" pending={send.isPending} onPress={() => void submit()} />
    </ScrollView>
  );
}
