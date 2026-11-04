import { cssInterop } from "nativewind";
import type { ComponentProps } from "react";
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView as KeyboardControllerAvoidingView,
} from "react-native-keyboard-controller";

// Android draws edge to edge (Expo 58), so the window no longer shrinks for the keyboard and a
// plain ScrollView or the core KeyboardAvoidingView leaves fields under it. These two follow the
// keyboard themselves, Modals included. Needs <KeyboardProvider> at the root (app/_layout.tsx).
cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});
cssInterop(KeyboardControllerAvoidingView, { className: "style" });

/** Space kept between the focused field and the keyboard's top edge. */
const FIELD_GAP = 24;

type KeyboardScrollViewProps = ComponentProps<typeof KeyboardAwareScrollView> & {
  className?: string;
  contentContainerClassName?: string;
};

/**
 * A form's ScrollView: scrolls the focused field above the keyboard, and lets a tap on a button
 * land while the keyboard is open.
 */
export function KeyboardScrollView({
  bottomOffset = FIELD_GAP,
  keyboardShouldPersistTaps = "handled",
  ...props
}: KeyboardScrollViewProps) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  );
}

type KeyboardAvoidingViewProps = ComponentProps<typeof KeyboardControllerAvoidingView> & {
  className?: string;
};

/**
 * Lifts what sits at the bottom (a sheet, a composer) above the keyboard. It measures its own
 * place on screen, so a header or tab bar above it needs no offset.
 */
export function KeyboardAvoidingView({
  behavior = "padding",
  automaticOffset = true,
  ...props
}: KeyboardAvoidingViewProps) {
  return (
    <KeyboardControllerAvoidingView
      behavior={behavior}
      automaticOffset={automaticOffset}
      {...props}
    />
  );
}
