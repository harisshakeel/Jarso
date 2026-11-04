import { parentPageCopy } from "@jarso/core/dashboard";
import { familySettingsCopy } from "@jarso/core/family";
import { parentGuideCopy } from "@jarso/core/guide";
import { parentLearningCopy } from "@jarso/core/learning";
import { noticeGroupCopy } from "@jarso/core/notifications";
import { rulesCopy } from "@jarso/core/rules";
import { Redirect, Stack, useGlobalSearchParams, usePathname, useSegments } from "expo-router";
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
  { name: "notifications", title: noticeGroupCopy.title },
  { name: "children/new", title: familySettingsCopy.addChild },
  { name: "invite", title: familySettingsCopy.acceptInvitation },
  // The hub sets its own title (the child's nickname) once the family has loaded.
  { name: "children/[childId]/index", title: parentPageCopy.child },
  // History and learning add the child's nickname once the family has loaded.
  { name: "children/[childId]/history", title: parentPageCopy.historyTitle },
  { name: "children/[childId]/learning", title: parentLearningCopy.title },
  { name: "children/[childId]/rules", title: rulesCopy.title },
  // Allowance and gifts add the child's nickname once the family has loaded.
  { name: "children/[childId]/allowance", title: parentPageCopy.allowance },
  { name: "children/[childId]/gifts/new", title: parentPageCopy.gift },
  { name: "children/[childId]/gifts/[giftId]", title: parentPageCopy.gift },
  // The chats page adds the child's nickname, and a chat its own label, once loaded.
  { name: "children/[childId]/guide/index", title: parentGuideCopy.cardTitle },
  { name: "children/[childId]/guide/[conversationId]", title: parentGuideCopy.chatLabel },
];

/**
 * Where a signed-out or not-yet-set-up parent returns afterwards: this path with its query (an
 * invite link's `?code=` or `?token=`). Sign-in and setup still pass it through `safeNextPath`.
 */
function useNextPath(): string {
  const pathname = usePathname();
  const segments = useSegments();
  const params = useGlobalSearchParams();
  // Global params mix the query with the path's own (`[childId]`); keep only the query.
  const routeParams = new Set(
    segments.flatMap((segment) => /^\[(?:\.\.\.)?(.+)\]$/.exec(segment)?.slice(1) ?? []),
  );
  const query = Object.entries(params)
    .filter(([key]) => !routeParams.has(key))
    .flatMap(([key, value]) =>
      (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
        (one) => `${encodeURIComponent(key)}=${encodeURIComponent(one)}`,
      ),
    )
    .join("&");
  const path = SHARED_PATHS[pathname] ?? pathname;
  return query ? `${path}?${query}` : path;
}

/** Paths both groups own, kept group-qualified so they resolve to the parent's screen. */
const SHARED_PATHS: Record<string, string> = {
  "/": "/(parent)/(tabs)",
  "/jarso": "/(parent)/(tabs)/jarso",
};

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
  const next = useNextPath();
  const setup = useParentSetup();

  if (status === "loading") return <Loading />;
  // Jarso can't be reached: the session is kept, but the parent's screens stay closed.
  if (status === "unavailable") return <UnavailableNotice />;
  if (status === "child") return <Redirect href={homeFor("child")} />;
  if (status !== "parent" || !userId) {
    return <Redirect href={{ pathname: "/sign-in", params: { next } }} />;
  }
  if (!OPEN_BEFORE_SETUP.has(pathname)) {
    if (!setup.data) {
      // Never a parent screen while the gate can't be read.
      if (setup.isError) return <UnavailableNotice onRetry={() => void setup.refetch()} />;
      return <Loading />;
    }
    if (!isSetUp(setup.data)) {
      const params = pathname === "/" ? undefined : { next };
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
