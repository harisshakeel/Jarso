import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { homeFor } from "@/features/auth";
import { AddSheet } from "@/features/flows";
import { useParentLabel } from "@/features/progress";
import { useRequests } from "@/features/requests";

/** "What happened?": picks a money moment, then swaps itself for that flow's sheet. */
export default function AddRoute() {
  const router = useRouter();
  const parent = useParentLabel();
  const waiting = (useRequests().data ?? []).filter((r) => r.status === "pending").length;
  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <AddSheet
        parent={parent}
        waiting={waiting}
        onPick={(key) => router.replace(`/(child)/${key}`)}
        onAsks={() => router.replace("/(child)/requests")}
        onClose={() => (router.canGoBack() ? router.back() : router.replace(homeFor("child")))}
      />
    </SafeAreaView>
  );
}
