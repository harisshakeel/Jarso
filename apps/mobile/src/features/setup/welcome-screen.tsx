import { setupFlowCopy } from "@jarso/core/setup";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Jarso } from "@/components/brand";
import { Button, Text } from "@/components/ui";
import { type SignInMode, saveSignInMode } from "@/features/auth";

const copy = setupFlowCopy.welcome;

/**
 * Step 1, the front door on a phone nobody has signed in on: parent or kid. "I'm a kid" and
 * "I have an account" keep that choice, so the next start goes straight to sign-in.
 */
export function WelcomeScreen({ next }: { next?: string }) {
  const router = useRouter();
  const withNext = next ? { next } : {};

  const signIn = (mode: SignInMode) => {
    void saveSignInMode(mode);
    router.replace({ pathname: "/sign-in", params: { mode, ...withNext } });
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-6 px-6">
        <Jarso mood="wave" size={180} bounce />
        <Text accessibilityRole="header" className="text-center font-sans-extrabold text-h1">
          {copy.title}
        </Text>
      </View>
      <View className="gap-3 px-6 pb-6">
        <Button
          variant="keycap"
          size="lg"
          accessibilityLabel={copy.parent}
          onPress={() => router.push({ pathname: "/sign-up", params: withNext })}
        >
          <Text>{copy.parent}</Text>
        </Button>
        <Button
          variant="keycap-white"
          size="lg"
          accessibilityLabel={copy.child}
          onPress={() => signIn("child")}
        >
          <Text>{copy.child}</Text>
        </Button>
        <View className="flex-row items-center justify-center gap-1">
          <Text className="text-ink-2">{copy.haveAccount}</Text>
          <Button
            variant="link"
            size="sm"
            accessibilityLabel={`${copy.haveAccount}. ${copy.signIn}`}
            onPress={() => signIn("parent")}
          >
            <Text>{copy.signIn}</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
