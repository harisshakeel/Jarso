import { safeNextPath } from "@jarso/core/auth";
import { childSignInCopy } from "@jarso/core/family";
import { type Href, Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import {
  homeFor,
  loadSignInMode,
  ParentSignInForm,
  SignInForm,
  type SignInMode,
  saveSignInMode,
  useSession,
} from "@/features/auth";

const mark = require("@jarso/brand/assets/jarso-mark.png");

const MODES: { mode: SignInMode; label: string }[] = [
  { mode: "child", label: "I'm a child" },
  { mode: "parent", label: "I'm a parent" },
];

const HEADINGS: Record<SignInMode, { heading: string; subline: string }> = {
  child: childSignInCopy,
  // The web's /login card.
  parent: { heading: "Sign in", subline: "Welcome back." },
};

/**
 * One sign-in screen for both roles: the child's PIN form (web /sign-in/child) or the parent's
 * email form (web /login). The last choice is kept on the phone. After sign-in it goes to `next`
 * when that is a safe path, else the role's home.
 */
export default function SignInScreen() {
  const { status, role, notice } = useSession();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [mode, setMode] = useState<SignInMode>("child");

  useEffect(() => {
    let live = true;
    void loadSignInMode().then((saved) => {
      if (live) setMode(saved);
    });
    return () => {
      live = false;
    };
  }, []);

  if (role) return <Redirect href={safeNextPath(next, homeFor(role) as string) as Href} />;
  // The (child) guard shows the offline notice while the role cannot be read.
  if (status === "unavailable") return <Redirect href={homeFor("child")} />;

  const choose = (picked: SignInMode) => {
    setMode(picked);
    void saveSignInMode(picked);
  };
  const { heading, subline } = HEADINGS[mode];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center gap-6 px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-3">
            <Image source={mark} accessibilityIgnoresInvertColors className="h-14 w-14" />
            <Text accessibilityRole="header" className="text-center font-sans-extrabold text-h1">
              {heading}
            </Text>
            <Text className="text-center text-ink-2">{subline}</Text>
          </View>
          <View accessibilityRole="radiogroup" className="flex-row gap-2">
            {MODES.map((option) => {
              const selected = option.mode === mode;
              return (
                <Button
                  key={option.mode}
                  variant={selected ? "default" : "outline"}
                  className="flex-1"
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected, checked: selected }}
                  onPress={() => choose(option.mode)}
                >
                  <Text>{option.label}</Text>
                </Button>
              );
            })}
          </View>
          {mode === "parent" ? (
            <ParentSignInForm notice={notice} />
          ) : (
            <SignInForm notice={notice} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
