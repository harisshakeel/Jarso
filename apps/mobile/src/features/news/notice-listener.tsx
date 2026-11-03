import { inboxCopy, noticeText } from "@jarso/core/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { keys } from "@/lib/query";
import { subscribeToNotices } from "./realtime";

const TOAST_MS = 5_000;

/** What a notice can change: the badge, the inbox, and the screens its record shows on. */
const affected = (userId: string) => [
  keys.unread(userId),
  keys.notices(userId),
  keys.home(userId),
  keys.history(userId),
  keys.requests(userId),
  keys.goal(userId),
];

type NoticeListenerProps = { userId: string };

/**
 * Keeps the News badge and the inbox live (spec §6). A new notice shows a toast with "Open" and
 * refreshes what it affects; each (re)join refreshes once, covering anything sent while away. The
 * channel closes when the app goes to the background and opens again when it comes back.
 */
export function NoticeListener({ userId }: NoticeListenerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // The family's currency, for the notice's wording.
  const currency = useHome().data?.context.currency;
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The latest currency, without resubscribing when Home loads.
  const money = useRef(currency);
  money.current = currency;

  useEffect(() => {
    let connected = false;
    const refresh = () => {
      for (const queryKey of affected(userId)) void queryClient.invalidateQueries({ queryKey });
    };
    const start = () =>
      subscribeToNotices(
        userId,
        (change) => {
          refresh();
          if (change.type !== "new") return;
          const { title } = noticeText(change.notice, "child", money.current ?? "USD");
          clearTimeout(timer.current);
          setToast(title);
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
  }, [userId, queryClient]);

  if (!toast) return null;
  return (
    <SafeAreaView
      edges={["top"]}
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 px-4"
    >
      <Button
        variant="outline"
        accessibilityLabel={`${toast}. ${inboxCopy.open}`}
        accessibilityLiveRegion="polite"
        onPress={() => {
          setToast(null);
          router.push("/(child)/(tabs)/news");
        }}
        className="mt-2 h-auto min-h-14 justify-between rounded-xl bg-card px-4 py-3 shadow-md"
      >
        <Text numberOfLines={2} className="flex-1 font-sans-semibold">
          {toast}
        </Text>
        <Text className="font-sans-bold text-primary">{inboxCopy.open}</Text>
      </Button>
    </SafeAreaView>
  );
}
