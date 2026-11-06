import { familyCardsCopy, parentPageCopy } from "@jarso/core/dashboard";
import { inboxCopy } from "@jarso/core/notifications";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { Jarso } from "@/components/brand";
import { ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useFamily } from "@/features/family";
import { InboxList, useMarkRead, useNotices, useOpenNotice, useUnreadCount } from "@/features/news";
import { toUserMessage } from "@/lib";

/**
 * The parent's Notifications (the Inbox tab) in the rework's calm look: the heading with a
 * "3 new" chip, "Mark all as read", the notices grouped by day, "Show more". With none, a sleepy
 * Jarso and one line. The reads, paging and opening are the shared inbox's (`features/news`).
 */
export function ParentInboxScreen() {
  const notices = useNotices();
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const open = useOpenNotice("parent");
  const currency = useFamily().data?.family.currency ?? "USD";
  const items = notices.data?.pages.flatMap((page) => page.items) ?? [];
  const count = unread.data ?? 0;
  const hasUnread = items.some((item) => !item.read) || count > 0;
  const refresh = () => {
    void notices.refetch();
    void unread.refetch();
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-4 pb-10"
      refreshControl={<RefreshControl refreshing={notices.isRefetching} onRefresh={refresh} />}
    >
      <ScreenHeader
        title={parentPageCopy.inbox}
        trailing={
          count > 0 ? (
            <View className="rounded-full bg-tint-teal px-3 py-1">
              <Text className="font-sans-bold text-primary text-small">
                {familyCardsCopy.unread(count)}
              </Text>
            </View>
          ) : null
        }
      />
      {!notices.data ? (
        notices.error ? (
          <Text accessibilityRole="alert">{toUserMessage(notices.error)}</Text>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading" />
        )
      ) : items.length === 0 ? (
        <View className="items-center gap-2 rounded-3xl border border-border bg-card px-4 py-8">
          <Jarso mood="sleepy" size={96} />
          <Text className="font-sans-extrabold text-h2">{familyCardsCopy.inboxEmpty}</Text>
          <Text className="text-center text-muted-foreground">
            {familyCardsCopy.inboxEmptyLine}
          </Text>
        </View>
      ) : (
        <>
          {hasUnread ? (
            <Button
              className="self-end"
              variant="keycap-white"
              size="sm"
              accessibilityLabel={inboxCopy.markAll}
              disabled={markRead.isPending}
              onPress={() => markRead.mutate(null)}
            >
              <Text>{inboxCopy.markAll}</Text>
            </Button>
          ) : null}
          {markRead.error ? (
            <Text accessibilityRole="alert" className="text-destructive">
              {toUserMessage(markRead.error)}
            </Text>
          ) : null}
          <InboxList items={items} viewer="parent" currency={currency} onOpen={open} />
          {notices.hasNextPage ? (
            <Button
              variant="keycap-white"
              accessibilityLabel={inboxCopy.showMore}
              loading={notices.isFetchingNextPage}
              onPress={() => void notices.fetchNextPage()}
            >
              <Text>{inboxCopy.showMore}</Text>
            </Button>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
