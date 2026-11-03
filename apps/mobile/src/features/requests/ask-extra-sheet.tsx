import { emergencyMessage, emergencySchema } from "@jarso/core/requests";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { z } from "zod";
import { Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { actionErrorMessage } from "@/lib";
import {
  AmountInput,
  HomeWait,
  Notice,
  ReasonInput,
  SentView,
  SubmitButton,
  useSendOnce,
} from "./sheet-parts";
import { useCreateEmergency } from "./use-request-mutations";

type FieldErrors = { amount?: string[]; reason?: string[] };

/**
 * "Ask for extra" (FR15): ask the parent for extra money with a reason. Nothing is reserved; if
 * the parent says yes it lands in Spend when they hand it over. Mount it once per opening: the
 * idempotency key is made on mount and reused by every retry.
 */
export function AskExtraSheet({ onClose }: { onClose: () => void }) {
  const home = useHome();
  const [idempotencyKey] = useState(() => randomUUID());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [notice, setNotice] = useState<string>();
  const send = useCreateEmergency();
  const once = useSendOnce();
  const currency = home.data?.context.currency;
  if (!currency) return <HomeWait error={home.error} onClose={onClose} />;

  function submit() {
    return once(async () => {
      setNotice(undefined);
      const parsed = emergencySchema(currency as string).safeParse({
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
        await send.mutateAsync({
          amountMinor: parsed.data.amountMinor,
          reason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
        });
      } catch (error) {
        setNotice(await actionErrorMessage(error));
      }
    });
  }

  if (send.data) {
    return <SentView message={emergencyMessage(send.data, currency)} onClose={onClose} />;
  }

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-6 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          Ask for extra money
        </Text>
        <Text className="text-muted-foreground">
          Say what it's for. If your parent says yes, it goes into Spend when they hand it over.
        </Text>
      </View>
      <AmountInput
        id="ask-extra"
        value={amount}
        onChange={setAmount}
        error={fieldErrors?.amount?.[0]}
      />
      <ReasonInput
        id="ask-extra"
        value={reason}
        onChange={setReason}
        error={fieldErrors?.reason?.[0]}
      />
      <Notice message={notice} />
      <SubmitButton label="Ask" pending={send.isPending} onPress={() => void submit()} />
    </ScrollView>
  );
}
