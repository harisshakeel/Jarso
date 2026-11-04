import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

/**
 * Jarso's own short sheet before a provider's (mockup I): a scrim, a grab handle, an h2 title
 * and a muted line, then the content. Tapping the scrim or Back closes it unless `busy`.
 */
export function BottomSheet({
  title,
  detail,
  busy,
  onClose,
  children,
}: {
  title: string;
  detail?: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={close}>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-0 bg-black/45"
          onPress={close}
        />
        <View accessibilityViewIsModal className="gap-3 rounded-t-2xl bg-card px-4 pt-2.5 pb-5">
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-1 w-9 self-center rounded-full bg-border"
          />
          <Text accessibilityRole="header" className="font-sans-bold text-h2">
            {title}
          </Text>
          {detail ? <Text className="text-muted-foreground">{detail}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** A two-or-more option choice (mockup I's provider pick): one radio per option, 48 dp tall. */
export function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row gap-2">
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
              "min-h-12 flex-1 items-center justify-center rounded-xl px-3",
              on ? "bg-primary" : "bg-muted",
            )}
          >
            <Text className={cn("font-sans-bold", on && "text-primary-foreground")}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
