import { inboxCopy } from "@jarso/core/notifications";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, CoachSays, ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { toUserMessage } from "@/lib";
import { InboxList } from "./inbox-list";
import { useMarkRead, useNotices, useUnreadCount } from "./use-notices";
import { useOpenNotice } from "./use-open-notice";

/**
 * News (the web's child inbox): newest first, grouped by day, 20 at a time with "Show more".
 * Opening a notice saves it as read and goes to the record; "Mark all as read" clears the badge.
 */
export function NewsScreen() {
  const home = useHome();
  const notices = useNotices();
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const open = useOpenNotice();
  const currency = home.data?.context.currency ?? "USD";
  const items = notices.data?.pages.flatMap((page) => page.items) ?? [];
  const hasUnread = items.some((item) => !item.read) || (unread.data ?? 0) > 0;
  const refresh = () => {
    void notices.refetch();
    void unread.refetch();
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-4 pb-10"
        refreshControl={<RefreshControl refreshing={notices.isRefetching} onRefresh={refresh} />}
      >
        <ScreenHeader title={inboxCopy.childHeading} />
        {!notices.data ? (
          notices.error ? (
            <Text accessibilityRole="alert">{toUserMessage(notices.error)}</Text>
          ) : (
            <ActivityIndicator accessibilityLabel="Loading" />
          )
        ) : items.length === 0 ? (
          <Card>
            <CoachSays coachKey="inbox" moment="nothingNew" />
          </Card>
        ) : (
          <>
            {hasUnread ? (
              <View className="items-end">
                <Button
                  variant="outline"
                  accessibilityLabel={inboxCopy.markAll}
                  disabled={markRead.isPending}
                  onPress={() => markRead.mutate(null)}
                >
                  <Text>{inboxCopy.markAll}</Text>
                </Button>
              </View>
            ) : null}
            {markRead.error ? (
              <Text accessibilityRole="alert" className="text-destructive">
                {toUserMessage(markRead.error)}
              </Text>
            ) : null}
            <InboxList items={items} currency={currency} onOpen={open} />
            {notices.hasNextPage ? (
              <Button
                variant="outline"
                accessibilityLabel={inboxCopy.showMore}
                disabled={notices.isFetchingNextPage}
                onPress={() => void notices.fetchNextPage()}
              >
                <Text>{inboxCopy.showMore}</Text>
              </Button>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
