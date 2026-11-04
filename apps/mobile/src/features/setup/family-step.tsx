import { supportedCurrencies } from "@jarso/core/config";
import {
  type Currency,
  createFamilySchema,
  currencyForLocale,
  currencyLabels,
  setupCopy,
} from "@jarso/core/family";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { Eyebrow } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { actionErrorMessage } from "@/lib";
import { ChoiceGroup } from "./choice-group";
import { useCreateFamily } from "./use-setup";

type FieldErrors = Partial<Record<"currency" | "timezone", string[]>>;

const currencies = supportedCurrencies.map((value) => ({ value, label: currencyLabels[value] }));

/** The phone's own locale and time zone, as the web reads the browser's. */
const device = () => Intl.DateTimeFormat().resolvedOptions();

/** Currency and time zone (the web's "Set up your family" card). */
export function FamilyStep() {
  const create = useCreateFamily();
  const [timezone] = useState(() => device().timeZone);
  const [currency, setCurrency] = useState<Currency>(() => currencyForLocale(device().locale));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [formError, setFormError] = useState<string>();

  async function submit() {
    if (create.isPending) return;
    setFormError(undefined);
    const parsed = createFamilySchema.safeParse({ currency, timezone });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors(undefined);
    try {
      await create.mutateAsync(parsed.data);
    } catch (error) {
      setFormError(await actionErrorMessage(error));
    }
  }

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Eyebrow>{setupCopy.eyebrow}</Eyebrow>
        <Text accessibilityRole="header" className="font-sans-extrabold text-h1">
          {setupCopy.title}
        </Text>
        <Text className="text-ink-2">{setupCopy.intro}</Text>
      </View>
      <ChoiceGroup<Currency>
        label={setupCopy.currency}
        options={currencies}
        value={currency}
        onChange={setCurrency}
        description={setupCopy.currencyHelp}
        errors={fieldErrors?.currency}
      />
      <View className="gap-1">
        <Text className="font-sans-bold">{setupCopy.timezone}</Text>
        <Text className="text-ink-2">{timezone || setupCopy.findingTimezone}</Text>
        <Text className="text-muted-foreground">{setupCopy.timezoneHelp}</Text>
        {fieldErrors?.timezone?.[0] ? (
          <Text accessibilityLiveRegion="polite" className="text-destructive">
            {fieldErrors.timezone[0]}
          </Text>
        ) : null}
      </View>
      {formError ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {formError}
        </Text>
      ) : null}
      <Button
        size="lg"
        accessibilityLabel={setupCopy.create}
        accessibilityState={{ busy: create.isPending, disabled: create.isPending }}
        disabled={create.isPending}
        onPress={() => void submit()}
      >
        {create.isPending ? <ActivityIndicator color="white" /> : <Text>{setupCopy.create}</Text>}
      </Button>
    </View>
  );
}
