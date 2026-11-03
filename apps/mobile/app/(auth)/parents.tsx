import { Link } from "expo-router";
import { Linking, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { WEB_URL } from "@/config";
import { useSession } from "@/features/auth";
import { logger } from "@/lib";

/** Wave 1 has no parent sign-in on the phone: parents are sent to the web. */
export default function ParentsScreen() {
  const { status, signOut } = useSession();

  const openWeb = () =>
    Linking.openURL(WEB_URL).catch((error: unknown) => {
      logger.warn("Could not open the web app", { error });
    });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center gap-6 px-6">
        <Text accessibilityRole="header" className="text-center font-sans-extrabold text-h1">
          Parents, use Jarso on the web for now
        </Text>
        <Button
          size="lg"
          accessibilityRole="link"
          accessibilityLabel="Open jarso.vercel.app"
          onPress={openWeb}
        >
          <Text>jarso.vercel.app</Text>
        </Button>
        {status !== "signed-out" ? (
          <Button variant="outline" accessibilityLabel="Sign out" onPress={() => void signOut()}>
            <Text>Sign out</Text>
          </Button>
        ) : null}
        <Link href="/sign-in" asChild>
          <Button
            variant="link"
            accessibilityRole="link"
            accessibilityLabel="Are you a kid? Sign in here"
          >
            <Text>Are you a kid? Sign in here</Text>
          </Button>
        </Link>
      </View>
    </SafeAreaView>
  );
}
