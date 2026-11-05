import type { PaymentProviderId } from "@jarso/core/payments";
import { ChevronRightIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";
import { ProviderLogo } from "./provider-logo";

/**
 * One provider to pay with (mockup v3 1): a full-width outlined row with the logo, the provider's
 * name and a chevron, left-aligned so several line up. The name alone shows (the card's heading
 * says what it does); `accessibilityLabel` keeps the verb for screen readers.
 */
export function ProviderRow({
  provider,
  label,
  accessibilityLabel,
  busy,
  disabled,
  onPress,
}: {
  provider: PaymentProviderId;
  label: string;
  accessibilityLabel: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const tokens = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-12 flex-row items-center gap-3 rounded-2xl border-[1.5px] border-border px-3 py-2 active:bg-muted",
        disabled && "opacity-50",
      )}
    >
      <ProviderLogo provider={provider} />
      <Text className="flex-1 font-sans-bold">{label}</Text>
      <ChevronRightIcon size={20} color={tokens["muted-foreground"]} />
    </Pressable>
  );
}

/**
 * Which provider to save a card with (mockup v3 5): stacked full-width radio rows with the logo,
 * the name and a radio on the right; the chosen row has the primary border on secondary.
 */
export function ProviderChoice({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: PaymentProviderId; label: string }[];
  value: PaymentProviderId;
  onChange: (value: PaymentProviderId) => void;
  disabled: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" className="gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: on, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            className={cn(
              "min-h-12 flex-row items-center gap-3 rounded-2xl border-[1.5px] px-3 py-2",
              on ? "border-primary bg-secondary" : "border-border",
            )}
          >
            <ProviderLogo provider={option.value} />
            <Text className={cn("flex-1 font-sans-bold", on && "text-secondary-foreground")}>
              {option.label}
            </Text>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className={cn(
                "size-[18px] rounded-full",
                on ? "border-[5px] border-primary" : "border-2 border-input",
              )}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
