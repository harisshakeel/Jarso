import {
  takeOutLimit,
  type WithdrawalResult,
  withdrawalMessage,
  withdrawalSchema,
} from "@jarso/core/requests";
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
  ReasonInput,
  RuleLines,
  SentView,
  SubmitButton,
  useSendOnce,
} from "./sheet-parts";
import { useChildRules, useCreateWithdrawal } from "./use-request-mutations";

type FieldErrors = { amount?: string[]; reason?: string[] };

function isSent(result: WithdrawalResult) {
  return result.status !== "over_available" && result.status !== "over_cap";
}

/**
 * "Take money out of Save": ask a parent for money from Save. Whether it is waiting or done at
 * once is the server's call; the sheet only shows the message for the status it gets back. Mount
 * it once per opening: the idempotency key is made on mount and reused by every retry.
 */
export function TakeOutSheet({ onClose }: { onClose: () => void }) {
  const home = useHome();
  const rules = useChildRules();
  const [idempotencyKey] = useState(() => randomUUID());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [notice, setNotice] = useState<string>();
  const send = useCreateWithdrawal();
  const once = useSendOnce();
  const currency = home.data?.context.currency;
  if (!home.data || !currency) return <HomeWait error={home.error} onClose={onClose} />;
  const limitMinor = takeOutLimit(home.data.availability);

  const ruleLines = rules.data
    ? [
        jarMovesLineForChild(rules.data.jarMovesApproval),
        ...rules.data.rules
          .filter(
            (rule) => rule.kind === "withdrawal_cap" || rule.kind === "withdrawal_auto_approve",
          )
          .map((rule) => describeRuleForChild(rule, currency)),
      ].filter((line): line is string => line !== null)
    : [];

  function submit() {
    return once(async () => {
      setNotice(undefined);
      const parsed = withdrawalSchema(currency as string).safeParse({
        amount,
        reason,
        idempotencyKey,
      });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        const result = await send.mutateAsync({
          amountMinor: parsed.data.amountMinor,
          reason: parsed.data.reason ?? "",
          idempotencyKey: parsed.data.idempotencyKey,
        });
        if (!isSent(result)) setNotice(withdrawalMessage(result, currency as string));
      } catch (error) {
        setNotice(await actionErrorMessage(error));
      }
    });
  }

  if (send.data && isSent(send.data)) {
    return <SentView message={withdrawalMessage(send.data, currency)} onClose={onClose} />;
  }

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-6 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          Take money out of Save
        </Text>
        <Text className="text-muted-foreground">
          You can take out up to {formatMoney(limitMinor, currency, { showMinor: "nonzero" })}
        </Text>
      </View>
      <RuleLines lines={ruleLines} />
      <AmountInput
        id="take-out"
        value={amount}
        onChange={setAmount}
        error={fieldErrors?.amount?.[0]}
      />
      <ReasonInput
        id="take-out"
        value={reason}
        onChange={setReason}
        error={fieldErrors?.reason?.[0]}
      />
      <Notice message={notice} />
      <SubmitButton label="Ask" pending={send.isPending} onPress={() => void submit()} />
    </ScrollView>
  );
}
