import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { homeFor } from "@/features/auth";
import { AddSheet } from "@/features/flows";

/** "What happened?": picks a money moment, then swaps itself for that flow's sheet. */
export default function AddRoute() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <AddSheet
        onPick={(key) => router.replace(`/(child)/${key}`)}
        onAsks={() => router.replace("/(child)/requests")}
        onClose={() => (router.canGoBack() ? router.back() : router.replace(homeFor("child")))}
      />
    </SafeAreaView>
  );
}
