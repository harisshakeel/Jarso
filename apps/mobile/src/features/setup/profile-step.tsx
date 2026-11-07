import { type Gender, genderLabels, genderOptions } from "@jarso/core/config";
import {
  EARLIEST_BIRTH_DATE,
  latestAdultBirthDate,
  parentDetailsSchema,
  profileCopy,
} from "@jarso/core/profiles";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { Button, DateField, Text } from "@/components/ui";
import { actionErrorMessage, flash } from "@/lib";
import { ChoiceGroup } from "./choice-group";
import { CountryField } from "./country-field";
import { useSaveParentDetails } from "./use-setup";

type FieldErrors = Partial<Record<"dateOfBirth" | "country" | "gender", string[]>>;

const genders = genderOptions.map((value) => ({ value, label: genderLabels[value] }));

/** Date of birth, country and gender (ADR 0008), as the web's completion dialog asks them. */
export function ProfileStep() {
  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text accessibilityRole="header" className="font-sans-extrabold text-h1">
          {profileCopy.completeTitle}
        </Text>
        <Text className="text-ink-2">{profileCopy.completeBody}</Text>
      </View>
      <ParentDetailsForm />
    </View>
  );
}

/**
 * The details form itself (the web's ParentDetailsForm): blank in setup, filled in with the saved
 * details in settings.
 */
export function ParentDetailsForm({
  defaults,
  submitLabel = profileCopy.completeSubmit,
  successMessage = profileCopy.completeSaved,
  beforeSave,
}: {
  defaults?: { dateOfBirth: string; country: string; gender: Gender } | null;
  submitLabel?: string;
  successMessage?: string;
  /** Runs once the details are valid, before they are saved (setup's "Your child calls you"). */
  beforeSave?: () => Promise<void>;
}) {
  const save = useSaveParentDetails();
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(defaults?.dateOfBirth ?? null);
  const [country, setCountry] = useState<string | null>(defaults?.country ?? null);
  const [gender, setGender] = useState<Gender | null>(defaults?.gender ?? null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [formError, setFormError] = useState<string>();

  async function submit() {
    if (save.isPending) return;
    setFormError(undefined);
    const parsed = parentDetailsSchema.safeParse({
      dateOfBirth: dateOfBirth ?? "",
      country,
      gender,
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors(undefined);
    try {
      await beforeSave?.();
      await save.mutateAsync(parsed.data);
      flash(successMessage);
    } catch (error) {
      setFormError(await actionErrorMessage(error));
    }
  }

  return (
    <View className="gap-6">
      <DateField
        label={profileCopy.dateOfBirth}
        value={dateOfBirth}
        onChange={setDateOfBirth}
        minimumDate={EARLIEST_BIRTH_DATE}
        maximumDate={latestAdultBirthDate()}
        description={profileCopy.dateOfBirthHelp}
        errors={fieldErrors?.dateOfBirth}
      />
      <CountryField
        label={profileCopy.country}
        placeholder={profileCopy.countryPlaceholder}
        description={profileCopy.countryHelp}
        value={country}
        onChange={setCountry}
        errors={fieldErrors?.country}
      />
      <ChoiceGroup<Gender>
        label={profileCopy.gender}
        options={genders}
        value={gender}
        onChange={setGender}
        description={profileCopy.genderHelp}
        errors={fieldErrors?.gender}
      />
      {formError ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {formError}
        </Text>
      ) : null}
      <Button
        size="lg"
        accessibilityLabel={submitLabel}
        accessibilityState={{ busy: save.isPending, disabled: save.isPending }}
        disabled={save.isPending}
        onPress={() => void submit()}
      >
        {save.isPending ? <ActivityIndicator color="white" /> : <Text>{submitLabel}</Text>}
      </Button>
    </View>
  );
}
