import type { PictureIcon, PictureTint } from "@jarso/core/home";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAvoidingView, KeyboardScrollView } from "@/components/screen";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";
import { pictureIcon, TINT } from "./icons";

type FlowShellProps = {
  title: string;
  step?: number;
  steps?: number;
  onBack?: () => void;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  icon?: PictureIcon;
  tint?: PictureTint;
};

/** A flow screen: back or close, step dots, a title, a scrolling body and a pinned footer. */
export function FlowShell({
  title,
  step,
  steps,
  onBack,
  onClose,
  footer,
  children,
  icon,
  tint = "teal",
}: FlowShellProps) {
  const tokens = useTokens();
  const Nav = pictureIcon(onBack ? "arrow-left" : "x");
  const Title = icon ? pictureIcon(icon) : null;
  const paint = TINT[tint];
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onBack ? "Back" : "Close"}
          onPress={onBack ?? onClose}
          className="size-11 items-center justify-center rounded-full bg-muted"
        >
          <Nav size={22} color={tokens.foreground} />
        </Pressable>
        {steps && step ? (
          <View
            accessible
            accessibilityLabel={`Step ${step} of ${steps}`}
            className="flex-row items-center gap-1.5"
          >
            {Array.from({ length: steps }, (_, i) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length dots
                key={i}
                className={cn("h-2 w-8 rounded-full", i < step ? "bg-primary" : "bg-muted")}
              />
            ))}
          </View>
        ) : null}
        <View className="size-11" />
      </View>
      {/* The footer shares the avoiding view with the body, so the keyboard lifts the button too. */}
      <KeyboardAvoidingView className="flex-1">
        <KeyboardScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-4 pt-3 pb-4"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center gap-3">
            {Title ? (
              <View className={cn("size-11 items-center justify-center rounded-xl", paint.box)}>
                <Title size={24} color={tokens[paint.icon]} />
              </View>
            ) : null}
            <Text accessibilityRole="header" className="flex-1 font-sans-extrabold text-h1">
              {title}
            </Text>
          </View>
          {children}
        </KeyboardScrollView>
        <View className="gap-2 px-4 pt-2 pb-4">{footer}</View>
      </KeyboardAvoidingView>
    </View>
  );
}
