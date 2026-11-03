import { childSignInCopy } from "@jarso/core/family";
import { Link, Redirect } from "expo-router";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { SignInForm, useSession } from "@/features/auth";

const mark = require("@jarso/brand/assets/jarso-mark.png");

/** The child's PIN sign-in (copy from web /sign-in/child), plus the way out for parents. */
export default function SignInScreen() {
  const { status, notice } = useSession();
  // The (child) guard shows the tabs, or the offline notice while the role cannot be read.
  if (status === "child" || status === "unavailable") return <Redirect href="/" />;

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
              {childSignInCopy.heading}
            </Text>
            <Text className="text-center text-ink-2">{childSignInCopy.subline}</Text>
          </View>
          <SignInForm notice={notice} />
          <Link href="/parents" asChild>
            <Button variant="link" accessibilityRole="link" accessibilityLabel="I'm a parent">
              <Text>I'm a parent</Text>
            </Button>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
