import {
  currencyLabels,
  familySettingsCopy,
  isCurrency,
  updateFamilySettingsSchema,
} from "@jarso/core/family";
import { Card, KeyboardScrollView } from "@/components/screen";
import { Text } from "@/components/ui";
import { useFamily, useUpdateTimezone } from "@/features/family";
import { ScreenState } from "./screen-state";
import { SingleFieldForm } from "./single-field-form";

const timezoneSchema = updateFamilySettingsSchema.shape.timezone;

/** The family's timezone (mockup screen 4), with the currency sentence below as small print. */
export function TimezoneSettingsScreen() {
  const family = useFamily();
  const saveTimezone = useUpdateTimezone();

  if (!family.data) {
    return <ScreenState error={family.error} onRetry={() => void family.refetch()} />;
  }
  const { timezone, currency } = family.data.family;
  const currencyLabel = isCurrency(currency) ? currencyLabels[currency] : currency;

  return (
    <KeyboardScrollView className="bg-background" contentContainerClassName="gap-3 px-4 pt-4 pb-10">
      <Card>
        <SingleFieldForm
          key={timezone}
          label={familySettingsCopy.timezone}
          description={familySettingsCopy.timezoneHelp}
          initial={timezone}
          submitLabel={familySettingsCopy.save}
          schema={timezoneSchema}
          save={(next) => saveTimezone.mutateAsync(next)}
          pending={saveTimezone.isPending}
          saved={familySettingsCopy.saved}
        />
      </Card>
      <Text className="px-1 text-small text-muted-foreground">
        {familySettingsCopy.familyBody(currencyLabel)}
      </Text>
    </KeyboardScrollView>
  );
}
