import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PurchaseSheet } from "@/features/diary";

type Params = { change?: string; amount?: string; label?: string; category?: string };

/**
 * "Spent something?". Mounts fresh on every open, so each opening gets its own idempotency key.
 * With `change` (a purchase that needs a look) it opens prefilled and replaces that one.
 */
export default function PurchaseRoute() {
  const router = useRouter();
  const { change, amount, label, category } = useLocalSearchParams<Params>();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <PurchaseSheet
        initial={change ? { amount: amount ?? "", label: label ?? "", category } : undefined}
        replaces={change}
        onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
    </SafeAreaView>
  );
}
