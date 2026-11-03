import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PurchaseSheet } from "@/features/diary";

/** "Spent something?". Mounts fresh on every open, so each opening gets its own idempotency key. */
export default function PurchaseRoute() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <PurchaseSheet onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
    </SafeAreaView>
  );
}
