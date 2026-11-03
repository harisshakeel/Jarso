import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { TakeOutSheet } from "@/features/requests";

/** "Take money out of Save". Mounts fresh on every open, so each opening gets its own idempotency key. */
export default function TakeOutRoute() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <TakeOutSheet onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
    </SafeAreaView>
  );
}
