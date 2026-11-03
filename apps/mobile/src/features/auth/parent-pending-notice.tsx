import { Linking, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { WEB_URL } from "@/config";
import { logger } from "@/lib";
import { useSession } from "./use-session";

/**
 * Temporary: a signed-in parent before the `(parent)` group exists. The session is kept; the
 * parent can open the web or sign out. The `(parent)` group replaces this.
 */
export function ParentPendingNotice() {
  const { signOut } = useSession();

  const openWeb = () =>
    Linking.openURL(WEB_URL).catch(() => {
      logger.warn("Could not open the web app");
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
          onPress={() => void openWeb()}
        >
          <Text>jarso.vercel.app</Text>
        </Button>
        <Button variant="outline" accessibilityLabel="Sign out" onPress={() => void signOut()}>
          <Text>Sign out</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
