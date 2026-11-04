import { parentPageCopy } from "@jarso/core/dashboard";
import { inboxCopy, type NoticeRole } from "@jarso/core/notifications";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, CoachSays, ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { toUserMessage } from "@/lib";
import { InboxList } from "./inbox-list";
import { useNoticeCurrency } from "./use-notice-currency";
import { useMarkRead, useNotices, useUnreadCount } from "./use-notices";
import { useOpenNotice } from "./use-open-notice";

/** The web's inbox headings: both are Notifications since 2026-11-04. */
const HEADING: Record<NoticeRole, string> = {
  child: inboxCopy.childHeading,
  parent: parentPageCopy.inbox,
};

/**
 * The inbox (the web's Notifications, for the child and the parent): newest first, grouped by day,
 * 20 at a time
 * with "Show more". Opening a notice saves it as read and goes to the record; "Mark all as read"
 * clears the badge.
 */
export function NewsScreen({ viewer: role }: { viewer: NoticeRole }) {
  const notices = useNotices();
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const open = useOpenNotice(role);
  const currency = useNoticeCurrency(role) ?? "USD";
  const items = notices.data?.pages.flatMap((page) => page.items) ?? [];
  const hasUnread = items.some((item) => !item.read) || (unread.data ?? 0) > 0;
  const refresh = () => {
    void notices.refetch();
    void unread.refetch();
  };

  return (
    // The parent's tabs show a header (Settings), which already clears the status bar.
    <SafeAreaView edges={role === "child" ? ["top"] : []} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-4 pb-10"
        refreshControl={<RefreshControl refreshing={notices.isRefetching} onRefresh={refresh} />}
      >
        <ScreenHeader title={HEADING[role]} />
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
            <InboxList items={items} viewer={role} currency={currency} onOpen={open} />
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
