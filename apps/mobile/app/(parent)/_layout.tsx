import { parentPageCopy } from "@jarso/core/dashboard";
import { Redirect, Stack, usePathname } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";
import { BodySizeProvider } from "@/components/ui";
import { homeFor, UnavailableNotice, useSession } from "@/features/auth";
import { NoticeListener } from "@/features/news";

type Options = ComponentProps<typeof Stack.Screen>["options"];

const SHEET: Options = {
  presentation: "formSheet",
  sheetAllowedDetents: [0.9],
  sheetGrabberVisible: true,
};

/**
 * Sheets over the tabs. Each opening mounts the screen anew. Later tasks add their routes here
 * as they land (the handover sheet, `children/[childId]/handover/[kind]/[id]`, in Task 5).
 */
const SHEETS: string[] = [];

/** Pages pushed over the tabs, with the native back button and the web's page title. */
const PAGES: { name: string; title: string }[] = [
  { name: "settings", title: parentPageCopy.settings },
];

/**
 * Where a signed-out parent returns after sign-in. `/` and `/jarso` exist in both groups, so the
 * parent's own are kept group-qualified; the rest are only the parent's.
 */
function nextPath(pathname: string): string {
  if (pathname === "/") return "/(parent)/(tabs)";
  if (pathname === "/jarso") return "/(parent)/(tabs)/jarso";
  return pathname;
}

/** The parent's area (tabs, then pages and sheets). Only a `parent` session gets past this guard. */
export default function ParentLayout() {
  const { status, userId } = useSession();
  const pathname = usePathname();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  // Jarso can't be reached: the session is kept, but the parent's screens stay closed.
  if (status === "unavailable") return <UnavailableNotice />;
  if (status === "child") return <Redirect href={homeFor("child")} />;
  if (status !== "parent" || !userId) {
    return <Redirect href={{ pathname: "/sign-in", params: { next: nextPath(pathname) } }} />;
  }

  return (
    // Parent reading text is 15/21; screens read it through `useBodySizeClass()`.
    <BodySizeProvider size="parent">
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
      {/* The Inbox badge, inbox and toast stay live while the app is in front (over the stack). */}
      <NoticeListener userId={userId} viewer="parent" />
    </BodySizeProvider>
  );
}
