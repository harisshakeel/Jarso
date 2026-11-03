import { parentPageCopy } from "@jarso/core/dashboard";
import { Redirect, Stack, usePathname } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";
import { BodySizeProvider } from "@/components/ui";
import { homeFor, UnavailableNotice, useSession } from "@/features/auth";
import { NoticeListener } from "@/features/news";
import { isSetUp, useParentSetup } from "@/features/setup";

type Options = ComponentProps<typeof Stack.Screen>["options"];

const SHEET: Options = {
  presentation: "formSheet",
  sheetAllowedDetents: [0.9],
  sheetGrabberVisible: true,
};

/** Sheets over the tabs. Each opening mounts the screen anew (one idempotency key per opening). */
const SHEETS: string[] = ["children/[childId]/handover/[kind]/[id]"];

/** Pages pushed over the tabs, with the native back button and the web's page title. */
const PAGES: { name: string; title: string }[] = [
  { name: "settings", title: parentPageCopy.settings },
  // The hub sets its own title (the child's nickname) once the family has loaded.
  { name: "children/[childId]/index", title: parentPageCopy.child },
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

/** Routes open before setup is done: setup itself, and settings (so a parent can sign out). */
const OPEN_BEFORE_SETUP = new Set(["/setup", "/settings"]);

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator accessibilityLabel="Loading" />
    </View>
  );
}

/**
 * The parent's area (tabs, then pages and sheets). Only a `parent` session gets past this guard,
 * and until the parent's details and family exist (ADR 0008) only setup and settings open.
 */
export default function ParentLayout() {
  const { status, userId } = useSession();
  const pathname = usePathname();
  const setup = useParentSetup();

  if (status === "loading") return <Loading />;
  // Jarso can't be reached: the session is kept, but the parent's screens stay closed.
  if (status === "unavailable") return <UnavailableNotice />;
  if (status === "child") return <Redirect href={homeFor("child")} />;
  if (status !== "parent" || !userId) {
    return <Redirect href={{ pathname: "/sign-in", params: { next: nextPath(pathname) } }} />;
  }
  if (!OPEN_BEFORE_SETUP.has(pathname)) {
    if (!setup.data) {
      // Never a parent screen while the gate can't be read.
      if (setup.isError) return <UnavailableNotice onRetry={() => void setup.refetch()} />;
      return <Loading />;
    }
    if (!isSetUp(setup.data)) {
      const params = pathname === "/" ? undefined : { next: nextPath(pathname) };
      return <Redirect href={{ pathname: "/(parent)/setup", params }} />;
    }
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
