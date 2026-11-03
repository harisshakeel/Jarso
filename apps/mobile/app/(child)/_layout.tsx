import { Redirect, Stack } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";
import { UnavailableNotice, useSession } from "@/features/auth";
import { NoticeListener } from "@/features/news";
import { OutboxSync } from "@/lib/outbox";

type Options = ComponentProps<typeof Stack.Screen>["options"];

const SHEET: Options = {
  presentation: "formSheet",
  sheetAllowedDetents: [0.9],
  sheetGrabberVisible: true,
};

/** Actions are sheets over the tabs. Each opening mounts the screen anew. */
const SHEETS = [
  "purchase",
  "put-in",
  "take-out",
  "ask-extra",
  "received",
  "goal-sheet",
  "guide-sheet",
];

/** Pages pushed over the tabs, with the native back button and the web's page title. */
const PAGES: { name: string; title: string }[] = [
  { name: "requests", title: "Requests" },
  { name: "me", title: "Me" },
  { name: "goal", title: "Your goal" },
  { name: "entry/[entryId]", title: "Diary" },
  { name: "learn/[missionKey]", title: "Mission" },
  { name: "learn/practice", title: "Practice" },
  { name: "learn/check-in", title: "Check-in" },
  { name: "learn/topics/[topicKey]", title: "Topic" },
  { name: "learn/week", title: "Your week" },
  { name: "learn/week-question", title: "One fresh question" },
  { name: "jarso/[conversationId]", title: "Jarso" },
];

/** The child's area (tabs, then pages and action sheets). Only a `child` session gets past this guard. */
export default function ChildLayout() {
  const { status, userId } = useSession();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  // Jarso can't be reached: the session is kept, but the tabs stay closed until the role is read.
  if (status === "unavailable") return <UnavailableNotice />;
  if (status !== "child" || !userId) return <Redirect href="/sign-in" />;

  return (
    <>
      {/* Sends purchases kept on the phone whenever they may get through. */}
      <OutboxSync userId={userId} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {PAGES.map(({ name, title }) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{ headerShown: true, title, headerBackTitle: "Back" }}
          />
        ))}
        {SHEETS.map((name) => (
          <Stack.Screen key={name} name={name} options={SHEET} />
        ))}
      </Stack>
      {/* The News badge, inbox and toast stay live while the app is in front (over the stack). */}
      <NoticeListener userId={userId} />
    </>
  );
}
