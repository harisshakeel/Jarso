import type { ComponentProps } from "react";
import { View } from "react-native";
import { Input, Label, Text } from "@/components/ui";

type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  description?: string;
  errors?: string[];
};

/** A labelled input with its hint and first error, shared by both sign-in forms. */
export function Field({ label, description, errors, ...input }: FieldProps) {
  const error = errors?.[0];
  return (
    <View className="gap-2">
      <Label nativeID={`${label}-label`}>{label}</Label>
      <Input
        accessibilityLabel={label}
        aria-labelledby={`${label}-label`}
        aria-invalid={Boolean(error)}
        className={error ? "border-destructive" : undefined}
        {...input}
      />
      {description ? <Text className="text-muted-foreground">{description}</Text> : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
