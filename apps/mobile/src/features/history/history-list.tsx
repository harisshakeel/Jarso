import {
  notEnoughSaveMessage,
  notEnoughSpendToUndoMessage,
  undoneReceivedMessage,
  undoneSpendMessage,
} from "@jarso/core/diary";
import { categoryOf, type HistoryItem } from "@jarso/core/ledger";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { useUndo } from "@/features/diary";
import { useSendOnce } from "@/features/requests";
import { actionErrorMessage, dayOfDate, formatMoney, toUserMessage } from "@/lib";
import { cn } from "@/lib/utils";
import { useHistory } from "./use-history";

type ShowMinor = "nonzero";
const SHOW: { showMinor: ShowMinor } = { showMinor: "nonzero" };

const JAR_NAME = { spend: "Spend", save: "Save" } as const;

/** Each kind in a word a child would use: no signs, no arrows, the words carry the direction. */
const VERB: Record<HistoryItem["kind"], string | null> = {
  allowance: "Came in",
  gift: "Gift",
  extra: "Extra money",
  received: "Got",
  purchase: "Spent",
  withdrawal: "Moved from Save to Spend",
  deposit: "Moved into Save",
  skipped: null,
};

/** "Fixed · was £5 · Snacks": only what changed; the old name when nothing else did. */
function fixedNote(item: HistoryItem, currency: string): string | null {
  const from = item.fixedFrom;
  if (!from || (item.kind !== "purchase" && item.kind !== "received")) return null;
  const kind = item.kind;
  const parts: string[] = [];
  if (from.amountMinor !== item.amountMinor)
    parts.push(formatMoney(from.amountMinor, currency, SHOW));
  if (categoryOf(from.category, kind).key !== categoryOf(item.category, kind).key) {
    parts.push(categoryOf(from.category, kind).label);
  }
  if (parts.length === 0 && from.label) parts.push(from.label);
  return parts.length === 0 ? "Fixed" : `Fixed · was ${parts.join(" · ")}`;
}

function amountText(item: HistoryItem, currency: string): string | null {
  if (item.amountMinor === null) return null;
  const given = formatMoney(item.amountMinor, currency, SHOW);
  // A gentle shortfall: "<given> of <due>".
  return item.dueMinor === null
    ? given
    : `${given} of ${formatMoney(item.dueMinor, currency, SHOW)}`;
}

/** Allowances, gifts, purchases, moves and misses, newest first, as a story rather than a statement. */
export function HistoryList() {
  const { history, home } = useHistory();
  const refresh = () => {
    void history.refetch();
    if (home.error) void home.refetch();
  };

  const failed = history.error ?? home.error;
  if (!history.data || !home.data) {
    if (!failed) {
      return (
        <SafeAreaView className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator accessibilityLabel="Loading your history" />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-6 px-6">
          <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
            {toUserMessage(failed)}
          </Text>
          <Button size="lg" accessibilityLabel="Try again" onPress={refresh}>
            <Text>Try again</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const { currency } = home.data.context;
  const items = history.data.pages.flatMap((page) => page.items);
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <FlatList
        testID="history-list"
        data={items}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerClassName="gap-2 p-4"
        ListHeaderComponent={
          <Text accessibilityRole="header" className="mb-2 font-sans-extrabold text-h2">
            History
          </Text>
        }
        ListEmptyComponent={
          <Text className="py-6 text-center text-muted-foreground">
            Your money story starts here.
          </Text>
        }
        ListFooterComponent={
          history.isFetchingNextPage ? (
            <ActivityIndicator accessibilityLabel="Loading older lines" className="py-4" />
          ) : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={history.isRefetching && !history.isFetchingNextPage}
            onRefresh={refresh}
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
        }}
        renderItem={({ item }) => <HistoryRow item={item} currency={currency} />}
      />
    </SafeAreaView>
  );
}

function HistoryRow({ item, currency }: { item: HistoryItem; currency: string }) {
  const undo = useUndo();
  const sendOnce = useSendOnce();
  const [note, setNote] = useState<{ text: string; bad: boolean }>();

  const verb = item.kind === "gift" && item.label !== "Gift" ? "Gift" : VERB[item.kind];
  const subline = [
    verb,
    item.kind === "received" && item.jar ? `into ${JAR_NAME[item.jar]}` : null,
    dayOfDate(item.occurredOn),
  ]
    .filter(Boolean)
    .join(" · ");
  const fixed = fixedNote(item, currency);
  const title = item.kind === "skipped" ? "Skipped" : item.label;
  const amount = amountText(item, currency);

  const onUndo = () =>
    sendOnce(async () => {
      if (!item.entryId) return;
      setNote(undefined);
      try {
        const result = await undo.mutateAsync(item.entryId);
        if (result === "not_enough_spend")
          return setNote({ text: notEnoughSpendToUndoMessage, bad: true });
        if (result === "not_enough_save") return setNote({ text: notEnoughSaveMessage, bad: true });
        setNote({
          text: item.kind === "received" ? undoneReceivedMessage : undoneSpendMessage,
          bad: false,
        });
      } catch (error) {
        setNote({ text: await actionErrorMessage(error), bad: true });
      }
    });

  return (
    <View className={cn("gap-1 py-1", item.undone && "opacity-70")}>
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            {item.kind === "purchase" || item.kind === "received" ? (
              <Text accessibilityElementsHidden importantForAccessibility="no">
                {categoryOf(item.category, item.kind).emoji}
              </Text>
            ) : null}
            <Text className="min-w-0 flex-1 font-sans-bold" numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text className="text-muted-foreground" numberOfLines={1}>
            {`${subline}${fixed ? ` · ${fixed}` : ""}${item.undone ? " · Undone" : ""}${item.paidByCard ? " · Paid by card" : ""}`}
          </Text>
        </View>
        {amount ? (
          <Text
            accessibilityLabel={item.undone ? `${amount} (undone)` : amount}
            className={cn("font-sans-bold", item.undone && "text-muted-foreground")}
          >
            {amount}
          </Text>
        ) : null}
        {item.canUndo && item.entryId ? (
          <Button
            variant="outline"
            size="sm"
            accessibilityLabel={`Undo ${item.label}`}
            accessibilityState={{ busy: undo.isPending, disabled: undo.isPending }}
            disabled={undo.isPending}
            onPress={() => void onUndo()}
          >
            {undo.isPending ? <ActivityIndicator /> : <Text>Undo</Text>}
          </Button>
        ) : null}
      </View>
      {note ? (
        <Text
          accessibilityRole={note.bad ? "alert" : undefined}
          accessibilityLiveRegion="polite"
          className={note.bad ? "text-destructive" : "text-muted-foreground"}
        >
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}
