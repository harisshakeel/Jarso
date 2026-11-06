import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { homeFor } from "@/features/auth";
import { AskExtraSheet } from "@/features/requests";

/** "Ask for extra money". Mounts fresh on every open, so each opening gets its own idempotency key. */
export default function AskExtraRoute() {
  const router = useRouter();
  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <AskExtraSheet
        onClose={() => (router.canGoBack() ? router.back() : router.replace(homeFor("child")))}
      />
    </SafeAreaView>
  );
}
