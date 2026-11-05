import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { KeyboardAvoidingView } from "@/components/screen";
import { Text } from "@/components/ui";

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
      {/* The sheet rides up with the keyboard, so a field in it (the phone number) stays seen. */}
      <KeyboardAvoidingView className="flex-1 justify-end">
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
      </KeyboardAvoidingView>
    </Modal>
  );
}
