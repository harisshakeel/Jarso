import { inboxCopy, type Notice, type NoticeRole, noticeText } from "@jarso/core/notifications";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { keys } from "@/lib/query";
import { subscribeToNotices } from "./realtime";
import { useNoticeCurrency } from "./use-notice-currency";

const TOAST_MS = 5_000;

/**
 * What a notice can change: the badge, the inbox, and the screens its record shows on. A
 * parent's notice is about a child: the family's reads and every child's pages.
 */
const affected = (userId: string, role: NoticeRole): QueryKey[] =>
  role === "parent"
    ? [keys.unread(userId), keys.notices(userId), keys.family(userId), ["child"]]
    : [
        keys.unread(userId),
        keys.notices(userId),
        keys.home(userId),
        keys.history(userId),
        keys.requests(userId),
        keys.goal(userId),
      ];

/** Each role's inbox: the Notifications tab. */
const INBOX: Record<NoticeRole, Href> = {
  child: "/(child)/(tabs)/news",
  parent: "/(parent)/(tabs)/inbox",
};

type NoticeListenerProps = { userId: string; viewer: NoticeRole };

/**
 * Keeps the Notifications badge and the inbox live (spec §6). A new notice shows a toast with "Open" and
 * refreshes what it affects; each (re)join refreshes once, covering anything sent while away. The
 * channel closes when the app goes to the background and opens again when it comes back.
 */
export function NoticeListener({ userId, viewer: role }: NoticeListenerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // The family's currency, for the notice's wording.
  const currency = useNoticeCurrency(role);
  // The notice itself, worded at render: a notice that lands before the family's currency has
  // loaded picks it up once it does, instead of keeping a fallback.
  const [toast, setToast] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let connected = false;
    const refresh = () => {
      for (const queryKey of affected(userId, role))
        void queryClient.invalidateQueries({ queryKey });
    };
    const start = () =>
      subscribeToNotices(
        userId,
        (change) => {
          refresh();
          if (change.type !== "new") return;
          clearTimeout(timer.current);
          setToast(change.notice);
          timer.current = setTimeout(() => setToast(null), TOAST_MS);
        },
        (isConnected) => {
          if (isConnected && !connected) refresh();
          connected = isConnected;
        },
      );

    let stop: (() => void) | null = AppState.currentState === "background" ? null : start();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active" && !stop) {
        connected = false;
        // Catch up at once; the rejoin's SUBSCRIBED may come late, or not at all.
        refresh();
        stop = start();
      } else if (state === "background" && stop) {
        stop();
        stop = null;
      }
    });
    return () => {
      appState.remove();
      stop?.();
      clearTimeout(timer.current);
    };
  }, [userId, role, queryClient]);

  if (!toast) return null;
  const { title } = noticeText(toast, role, currency ?? "USD");
  return (
    <SafeAreaView
      edges={["top"]}
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 px-4"
    >
      <Button
        variant="outline"
        accessibilityLabel={`${title}. ${inboxCopy.open}`}
        accessibilityLiveRegion="polite"
        onPress={() => {
          setToast(null);
          router.push(INBOX[role]);
        }}
        className="mt-2 h-auto min-h-14 justify-between rounded-xl bg-card px-4 py-3 shadow-md"
      >
        <Text numberOfLines={2} className="flex-1 font-sans-semibold">
          {title}
        </Text>
        <Text className="font-sans-bold text-primary">{inboxCopy.open}</Text>
      </Button>
    </SafeAreaView>
  );
}
