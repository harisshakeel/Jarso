import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoalSheet } from "@/features/goals";

/** "Set a goal" / "Change my goal". Mounts fresh on every open, from the saved goal. */
export default function GoalSheetRoute() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <GoalSheet onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
    </SafeAreaView>
  );
}
