import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { homeFor } from "@/features/auth";
import { PutInSheet } from "@/features/requests";

/** "Put money into Save". Mounts fresh on every open, so each opening gets its own idempotency key. */
export default function PutInRoute() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <PutInSheet
        onClose={() => (router.canGoBack() ? router.back() : router.replace(homeFor("child")))}
      />
    </SafeAreaView>
  );
}
