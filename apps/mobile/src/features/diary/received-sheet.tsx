import { entrySavedMessage, receivedCopy, receivedSchema } from "@jarso/core/diary";
import { RECEIVED_CATEGORIES } from "@jarso/core/ledger";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { KeyboardScrollView } from "@/components/screen";
import {
  AmountInput,
  HomeWait,
  Notice,
  SentToast,
  SubmitButton,
  useSendOnce,
} from "@/components/sheet";
import { Input, Label, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { actionErrorMessage, cn, isAppError } from "@/lib";
import { CategoryChips } from "./category-chips";
import { useRecordReceived } from "./use-record-received";

type FieldErrors = { amount?: string[]; label?: string[] };
type Jar = "spend" | "save";

/** "Which jar?" as radio chips (the web's ChoiceChips). */
export function JarChoice({ value, onChange }: { value: Jar; onChange: (jar: Jar) => void }) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={receivedCopy.jarLegend}
      className="gap-2"
    >
      <Text className="font-sans-bold">{receivedCopy.jarLegend}</Text>
      <View className="flex-row flex-wrap gap-2">
        {receivedCopy.jars.map((option) => {
          const checked = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked }}
              onPress={() => onChange(option.value)}
              className={cn(
                "min-h-11 justify-center rounded-full border px-5",
                checked ? "border-transparent bg-primary" : "border-border bg-background",
              )}
            >
              <Text className={cn("font-sans-bold", checked && "text-primary-foreground")}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * "Got money": money from another source (a gift, a job, a find). It counts at once, no parent
 * approval; online only, like the web. Mount it once per opening: the idempotency key is made on
 * mount and reused by every retry.
 */
export function ReceivedSheet({ onClose }: { onClose: () => void }) {
  const home = useHome();
  const [idempotencyKey] = useState(() => randomUUID());
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [jar, setJar] = useState<Jar>("spend");
  const [category, setCategory] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [refused, setRefused] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const record = useRecordReceived();
  const once = useSendOnce();
  const currency = home.data?.context.currency;
  if (!currency) return <HomeWait error={home.error} onClose={onClose} />;

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
        setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        await record.mutateAsync({ ...parsed.data, label: parsed.data.label ?? "" });
      } catch (error) {
        const message = await actionErrorMessage(error);
        if (isAppError(error) && error.code === "UNAVAILABLE") setNotice(message);
        else setRefused(message);
      }
    });
  }

  if (record.data) return <SentToast message={entrySavedMessage} onClose={onClose} />;

  const labelError = fieldErrors?.label?.[0];
  return (
    <KeyboardScrollView
      className="bg-background"
      contentContainerClassName="gap-6 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {receivedCopy.title}
        </Text>
        <Text className="text-muted-foreground">{receivedCopy.description}</Text>
      </View>
      <AmountInput
        id="received"
        value={amount}
        onChange={setAmount}
        error={fieldErrors?.amount?.[0]}
      />
      <CategoryChips
        options={RECEIVED_CATEGORIES}
        value={category}
        onChange={setCategory}
        legend={receivedCopy.categoryLegend}
      />
      <View className="gap-2">
        <JarChoice value={jar} onChange={setJar} />
        {jar === "save" ? (
          <Text className="text-muted-foreground">{receivedCopy.saveHint}</Text>
        ) : null}
      </View>
      <View className="gap-2">
        <Label nativeID="received-label-label">{receivedCopy.nameLabel}</Label>
        <Input
          accessibilityLabel={receivedCopy.nameLabel}
          aria-labelledby="received-label-label"
          value={label}
          onChangeText={setLabel}
          placeholder={receivedCopy.namePlaceholder}
          autoComplete="off"
          maxLength={60}
        />
        {labelError ? (
          <Text accessibilityLiveRegion="polite" className="text-destructive">
            {labelError}
          </Text>
        ) : null}
      </View>
      <Notice message={refused} />
      {notice ? (
        <Text accessibilityLiveRegion="polite" className="rounded-lg bg-muted px-3.5 py-2.5">
          {notice}
        </Text>
      ) : null}
      <View className="gap-2">
        <SubmitButton
          label={receivedCopy.submit}
          pending={record.isPending}
          disabled={!category}
          onPress={() => void submit()}
        />
        {category ? null : (
          <Text className="text-center text-muted-foreground">{receivedCopy.pickCategory}</Text>
        )}
      </View>
    </KeyboardScrollView>
  );
}
