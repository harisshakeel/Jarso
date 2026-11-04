import { View } from "react-native";
import { Button, Label, Text } from "@/components/ui";

type ChoiceGroupProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange(value: T): void;
  description?: string;
  errors?: string[];
};

/** A short list of radio buttons (the web's selects with few options): gender, currency. */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  description,
  errors,
}: ChoiceGroupProps<T>) {
  const error = errors?.[0];
  return (
    <View className="gap-2">
      <Label nativeID={`${label}-label`}>{label}</Label>
      <View accessibilityRole="radiogroup" aria-labelledby={`${label}-label`} className="gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Button
              key={option.value}
              variant={selected ? "default" : "outline"}
              className="justify-start"
              role="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(option.value)}
            >
              <Text>{option.label}</Text>
            </Button>
          );
        })}
      </View>
      {description ? <Text className="text-muted-foreground">{description}</Text> : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
