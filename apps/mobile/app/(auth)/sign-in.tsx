import { safeNextPath } from "@jarso/core/auth";
import { childSignInCopy, childSignInLink, parseChildSignInLink } from "@jarso/core/family";
import { setupFlowCopy } from "@jarso/core/setup";
import { type Href, Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardScrollView } from "@/components/screen";
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

const isMode = (value: unknown): value is SignInMode => value === "child" || value === "parent";

/**
 * One sign-in screen for both roles: the child's PIN form (web /sign-in/child) or the parent's
 * email form (web /login). The last choice is kept on the phone; a phone that never made one
 * opens Welcome instead. A child sign-in link (`jarso://sign-in?code=…&nickname=…`, the parent's
 * QR) fills in the child's form. After sign-in it goes to `next` when that is a safe path, else
 * the role's home.
 */
export default function SignInScreen() {
  const router = useRouter();
  const { status, role, notice } = useSession();
  const params = useLocalSearchParams<{
    next?: string;
    mode?: string;
    code?: string;
    nickname?: string;
  }>();
  const { next } = params;
  // Route params come straight from a link: checked by the same strict parser as a scanned QR.
  const fromLink = useMemo(
    () =>
      params.code && params.nickname
        ? parseChildSignInLink(
            childSignInLink({ familyCode: params.code, nickname: params.nickname }),
          )
        : null,
    [params.code, params.nickname],
  );
  const forced: SignInMode | null = fromLink ? "child" : isMode(params.mode) ? params.mode : null;
  const [mode, setMode] = useState<SignInMode | "welcome" | null>(forced);

  useEffect(() => {
    if (forced) {
      setMode(forced);
      return;
    }
    let live = true;
    void loadSignInMode().then((saved) => {
      if (live) setMode(saved ?? "welcome");
    });
    return () => {
      live = false;
    };
  }, [forced]);

  if (role) return <Redirect href={safeNextPath(next, homeFor(role) as string) as Href} />;
  // The (child) guard shows the offline notice while the role cannot be read.
  if (status === "unavailable") return <Redirect href={homeFor("child")} />;
  // A phone nobody has signed in on starts at Welcome; a notice means someone was signed in.
  if (mode === "welcome" && !notice) {
    return <Redirect href={{ pathname: "/welcome", params: next ? { next } : {} }} />;
  }
  if (mode === null) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  const shown: SignInMode = mode === "welcome" ? "child" : mode;

  const choose = (picked: SignInMode) => {
    setMode(picked);
    void saveSignInMode(picked);
  };
  const { heading, subline } = HEADINGS[shown];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardScrollView
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
            const selected = option.mode === shown;
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
        {shown === "parent" ? (
          <>
            <ParentSignInForm notice={notice} />
            <View className="flex-row items-center justify-center gap-1">
              <Text className="text-ink-2">{setupFlowCopy.newHere}</Text>
              <Button
                variant="link"
                size="sm"
                accessibilityLabel={setupFlowCopy.createAccount}
                onPress={() => router.push({ pathname: "/sign-up", params: next ? { next } : {} })}
              >
                <Text>{setupFlowCopy.createAccount}</Text>
              </Button>
            </View>
          </>
        ) : (
          <SignInForm notice={notice} initial={fromLink ?? undefined} />
        )}
      </KeyboardScrollView>
    </SafeAreaView>
  );
}
