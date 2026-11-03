import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { homeFor } from "@/features/auth";
import { ReceivedSheet } from "@/features/diary";

/** "Got money". Mounts fresh on every open, so each opening gets its own idempotency key. */
export default function ReceivedRoute() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ReceivedSheet
        onClose={() => (router.canGoBack() ? router.back() : router.replace(homeFor("child")))}
      />
    </SafeAreaView>
  );
}
