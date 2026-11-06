import { inboxCopy, kidInboxCopy } from "@jarso/core/notifications";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Jarso } from "@/components/brand";
import { Button, Text } from "@/components/ui";
import { toUserMessage } from "@/lib";
import { InboxList } from "./inbox-list";
import { useNoticeCurrency } from "./use-notice-currency";
import { useMarkRead, useNotices, useUnreadCount } from "./use-notices";
import { useOpenNotice } from "./use-open-notice";

/** Jarso napping under the list: the end, or nothing yet. Decoration; the line says it. */
function Napping({ line }: { line: string }) {
  return (
    <View className="items-center gap-1 pt-4">
      <Jarso testID="inbox-jarso" mood="sleepy" size={70} fill={0.6} />
      <Text className="font-sans-bold text-muted-foreground">{line}</Text>
    </View>
  );
}

/**
 * The child's inbox behind Home's bell (the stack header says Notifications): "Mark all read" as
 * a pill, the notices newest first by day (tap one to open it), "Show more", and Jarso napping
 * at the end. The parent's inbox stays `NewsScreen`.
 */
export function KidInboxScreen() {
  const notices = useNotices();
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const open = useOpenNotice("child");
  const currency = useNoticeCurrency("child") ?? "USD";
  const items = notices.data?.pages.flatMap((page) => page.items) ?? [];
  const hasUnread = items.some((item) => !item.read) || (unread.data ?? 0) > 0;
  const refresh = () => {
    void notices.refetch();
    void unread.refetch();
  };

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-4 pb-10"
        refreshControl={<RefreshControl refreshing={notices.isRefetching} onRefresh={refresh} />}
      >
        {!notices.data ? (
          notices.error ? (
            <Text accessibilityRole="alert">{toUserMessage(notices.error)}</Text>
          ) : (
            <ActivityIndicator accessibilityLabel="Loading" />
          )
        ) : items.length === 0 ? (
          <Napping line={kidInboxCopy.nothingNew} />
        ) : (
          <>
            {hasUnread ? (
              <View className="items-end">
                <Button
                  size="sm"
                  variant="secondary"
                  accessibilityLabel={inboxCopy.markAll}
                  disabled={markRead.isPending}
                  onPress={() => markRead.mutate(null)}
                >
                  <Text>{kidInboxCopy.markAll}</Text>
                </Button>
              </View>
            ) : null}
            {markRead.error ? (
              <Text accessibilityRole="alert" className="text-destructive">
                {toUserMessage(markRead.error)}
              </Text>
            ) : null}
            <InboxList items={items} viewer="child" currency={currency} onOpen={open} />
            {notices.hasNextPage ? (
              <Button
                variant="outline"
                accessibilityLabel={inboxCopy.showMore}
                disabled={notices.isFetchingNextPage}
                onPress={() => void notices.fetchNextPage()}
              >
                <Text>{inboxCopy.showMore}</Text>
              </Button>
            ) : (
              <Napping line={kidInboxCopy.allDone} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
