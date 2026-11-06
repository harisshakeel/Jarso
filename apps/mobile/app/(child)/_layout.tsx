import { guideCopy } from "@jarso/core/guide";
import { noticeGroupCopy } from "@jarso/core/notifications";
import { Redirect, Stack } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";
import { CelebrationProvider } from "@/components/celebrate";
import { homeFor, UnavailableNotice, useSession } from "@/features/auth";
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
  "add",
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
  { name: "news", title: noticeGroupCopy.title },
  { name: "notifications", title: noticeGroupCopy.title },
  { name: "memories", title: guideCopy.memories.title },
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
  // Both groups own `/`: a parent who lands here (cold start, a link) goes to Family.
  if (status === "parent") return <Redirect href={homeFor("parent")} />;
  if (status !== "child" || !userId) return <Redirect href="/sign-in" />;

  // Celebrations show over the whole child area, sheets included.
  return (
    <CelebrationProvider>
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
      {/* The Notifications badge, inbox and toast stay live while the app is in front (over the
          stack). */}
      <NoticeListener userId={userId} viewer="child" />
    </CelebrationProvider>
  );
}
