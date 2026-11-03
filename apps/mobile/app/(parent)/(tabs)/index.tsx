import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { homeFor, ParentPendingNotice, UnavailableNotice, useSession } from "@/features/auth";

/**
 * Temporary parent home so `homeFor("parent")` resolves before the (parent) group and its guard
 * exist. The group layout and the Family screen replace it.
 */
export default function ParentHomePlaceholder() {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  if (status === "unavailable") return <UnavailableNotice />;
  if (status === "child") return <Redirect href={homeFor("child")} />;
  if (status !== "parent") return <Redirect href="/sign-in" />;
  return <ParentPendingNotice />;
}
