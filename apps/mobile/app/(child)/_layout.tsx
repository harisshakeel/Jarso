import { Redirect, Stack } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";
import { UnavailableNotice, useSession } from "@/features/auth";

const SHEET: ComponentProps<typeof Stack.Screen>["options"] = {
  presentation: "formSheet",
  sheetAllowedDetents: [0.9],
  sheetGrabberVisible: true,
};

/** The child's area (tabs, then action sheets). Only a session whose role read `child` gets past this guard. */
export default function ChildLayout() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  // Jarso can't be reached: the session is kept, but the tabs stay closed until the role is read.
  if (status === "unavailable") return <UnavailableNotice />;
  if (status !== "child") return <Redirect href="/sign-in" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      {/* Actions are sheets over the tabs. Each opening mounts the screen anew. */}
      {["purchase", "put-in", "take-out", "ask-extra"].map((name) => (
        <Stack.Screen key={name} name={name} options={SHEET} />
      ))}
    </Stack>
  );
}
