import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { Button, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { actionErrorMessage, flash } from "@/lib";

/** One text field and its save button, for the parent's name and the family's timezone. */
export function SingleFieldForm({
  label,
  description,
  initial,
  submitLabel,
  schema,
  save,
  pending,
  saved,
}: {
  label: string;
  description?: string;
  initial: string;
  submitLabel: string;
  schema: z.ZodType<string>;
  save: (value: string) => Promise<unknown>;
  pending: boolean;
  saved: string;
}) {
  const [value, setValue] = useState(initial);
  const [fieldError, setFieldError] = useState<string[]>();
  const [formError, setFormError] = useState<string>();

  async function submit() {
    if (pending) return;
    setFormError(undefined);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      setFieldError(z.flattenError(parsed.error).formErrors);
      return;
    }
    setFieldError(undefined);
    try {
      await save(parsed.data);
      flash(saved);
    } catch (error) {
      setFormError(await actionErrorMessage(error));
    }
  }

  return (
    <View className="gap-3">
      <Field
        label={label}
        description={description}
        value={value}
        onChangeText={setValue}
        autoCorrect={false}
        errors={fieldError}
      />
      {formError ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {formError}
        </Text>
      ) : null}
      <Button
        variant="secondary"
        accessibilityLabel={submitLabel}
        accessibilityState={{ busy: pending, disabled: pending }}
        disabled={pending}
        onPress={() => void submit()}
      >
        {pending ? <ActivityIndicator /> : <Text>{submitLabel}</Text>}
      </Button>
    </View>
  );
}
