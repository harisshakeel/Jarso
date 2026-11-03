import { parentPageCopy } from "@jarso/core/dashboard";
import {
  diaryCopy,
  entryDetailCopy,
  notEnoughSaveMessage,
  notEnoughSpendToUndoMessage,
  undoneReceivedMessage,
  undoneSpendMessage,
} from "@jarso/core/diary";
import { categoryOf, type HistoryItem } from "@jarso/core/ledger";
import type { HistoryPage } from "@jarso/data/ledger";
import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronRightIcon } from "lucide-react-native";
import { type ReactElement, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useUndo, WhereItWentCard } from "@/features/diary";
import { useFamily } from "@/features/family";
import { useSendOnce } from "@/features/requests";
import {
  actionErrorMessage,
  dayOfDate,
  familyToday,
  formatMoney,
  toUserMessage,
  useTokens,
} from "@/lib";
import { cn } from "@/lib/utils";
import { useChildHistory, useHistory } from "./use-history";

type Show = { showMinor: "nonzero" | "always" };
/** The child sees "£5"; a parent sees exact amounts ("£5.00"), as on the web. */
const SHOW: Show = { showMinor: "nonzero" };
const PARENT_SHOW: Show = { showMinor: "always" };

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
function fixedNote(item: HistoryItem, currency: string, show: Show): string | null {
  const from = item.fixedFrom;
  if (!from || (item.kind !== "purchase" && item.kind !== "received")) return null;
  const kind = item.kind;
  const parts: string[] = [];
  if (from.amountMinor !== item.amountMinor)
    parts.push(formatMoney(from.amountMinor, currency, show));
  if (categoryOf(from.category, kind).key !== categoryOf(item.category, kind).key) {
    parts.push(categoryOf(from.category, kind).label);
  }
  if (parts.length === 0 && from.label) parts.push(from.label);
  return parts.length === 0 ? "Fixed" : `Fixed · was ${parts.join(" · ")}`;
}

function amountText(item: HistoryItem, currency: string, show: Show): string | null {
  if (item.amountMinor === null) return null;
  const given = formatMoney(item.amountMinor, currency, show);
  // A gentle shortfall: "<given> of <due>".
  return item.dueMinor === null
    ? given
    : `${given} of ${formatMoney(item.dueMinor, currency, show)}`;
}

/** Whether a line opens its detail (fix, undo, earlier versions), as on the web's Diary. */
export function opensDetail(item: HistoryItem): boolean {
  return Boolean(item.entryId) && (item.canFix || item.canUndo || item.fixedFrom !== null);
}

type HistoryListProps = {
  /** A parent reading this child's history. Without it, the signed-in child's own. */
  childId?: string;
  /** No undo, no fix and no entry detail: the parent's view. */
  readOnly?: boolean;
  header?: ReactElement;
};

/**
 * Allowances, gifts, purchases, moves and misses, newest first, as a story rather than a
 * statement. `header` goes above the lines (the Diary's actions and cards); its default is the
 * page heading for the child, and "Where your money went" for a parent reading a child's.
 */
export function HistoryList({ childId, readOnly = false, header }: HistoryListProps = {}) {
  return childId ? (
    <ChildHistoryForParent childId={childId} readOnly={readOnly} header={header} />
  ) : (
    <OwnHistory readOnly={readOnly} header={header} />
  );
}

function OwnHistory({ readOnly, header }: { readOnly: boolean; header?: ReactElement }) {
  const { history, home } = useHistory();
  const refresh = () => {
    void history.refetch();
    if (home.error) void home.refetch();
  };
  return (
    <HistoryView
      history={history}
      currency={home.data?.context.currency}
      failed={history.error ?? home.error}
      refresh={refresh}
      header={
        header ?? (
          <View className="mb-2">
            <ScreenHeader title={diaryCopy.heading} />
          </View>
        )
      }
      look={{
        readOnly,
        show: SHOW,
        skipped: "Skipped",
        empty: "Your money story starts here.",
        loading: "Loading your history",
        topEdge: true,
      }}
    />
  );
}

/** One child's history as a parent reads it: exact amounts, "Not given", nothing to change. */
function ChildHistoryForParent({
  childId,
  readOnly,
  header,
}: {
  childId: string;
  readOnly: boolean;
  header?: ReactElement;
}) {
  const family = useFamily();
  const timezone = family.data?.family.timezone;
  const history = useChildHistory(childId, timezone);
  const nickname = family.data?.children.find((child) => child.id === childId)?.nickname ?? "";
  const currency = family.data?.family.currency;
  const refresh = () => {
    void history.refetch();
    if (family.error) void family.refetch();
  };
  return (
    <HistoryView
      history={history}
      currency={currency}
      failed={history.error ?? family.error}
      refresh={refresh}
      header={
        header ??
        (timezone && currency ? (
          <View className="mb-2">
            <WhereItWentCard
              childId={childId}
              context={{ currency, timezone, today: familyToday(timezone) }}
            />
          </View>
        ) : undefined)
      }
      look={{
        readOnly,
        show: PARENT_SHOW,
        skipped: parentPageCopy.notGiven,
        empty: parentPageCopy.historyEmpty(nickname),
        loading: parentPageCopy.history(nickname),
        // The page sits under the stack's header, which already clears the status bar.
        topEdge: false,
      }}
    />
  );
}

/** How a list reads: the child's own, or a parent's view of a child's. */
type Look = {
  readOnly: boolean;
  show: Show;
  /** A skipped allowance: "Skipped" for the child, "Not given" for a parent. */
  skipped: string;
  empty: string;
  loading: string;
  topEdge: boolean;
};

function HistoryView({
  history,
  currency,
  failed,
  refresh,
  header,
  look,
}: {
  history: UseInfiniteQueryResult<InfiniteData<HistoryPage>>;
  currency: string | undefined;
  failed: unknown;
  refresh: () => void;
  header?: ReactElement;
  look: Look;
}) {
  const edges: Edge[] = look.topEdge ? ["top"] : [];
  if (!history.data || !currency) {
    if (!failed) {
      return (
        <SafeAreaView
          edges={look.topEdge ? undefined : []}
          className="flex-1 items-center justify-center bg-background"
        >
          <ActivityIndicator accessibilityLabel={look.loading} />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView edges={look.topEdge ? undefined : []} className="flex-1 bg-background">
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

  const items = history.data.pages.flatMap((page) => page.items);
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-background">
      <FlatList
        testID="history-list"
        data={items}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerClassName="gap-2 px-4 pt-4 pb-10"
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text className="py-6 text-center text-muted-foreground">{look.empty}</Text>
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
        renderItem={({ item }) =>
          look.readOnly ? (
            <View className={cn("py-1", item.undone && "opacity-70")}>
              <HistoryLine item={item} currency={currency} look={look} />
            </View>
          ) : (
            <HistoryRow item={item} currency={currency} look={look} />
          )
        }
      />
    </SafeAreaView>
  );
}

/** One line's words and amount; `actions` (undo, detail) sit after the amount. */
function HistoryLine({
  item,
  currency,
  look,
  actions,
}: {
  item: HistoryItem;
  currency: string;
  look: Look;
  actions?: ReactElement;
}) {
  const verb = item.kind === "gift" && item.label !== "Gift" ? "Gift" : VERB[item.kind];
  const subline = [
    verb,
    item.kind === "received" && item.jar ? `into ${JAR_NAME[item.jar]}` : null,
    dayOfDate(item.occurredOn),
  ]
    .filter(Boolean)
    .join(" · ");
  const fixed = fixedNote(item, currency, look.show);
  const title = item.kind === "skipped" ? look.skipped : item.label;
  const amount = amountText(item, currency, look.show);
  return (
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
      {actions}
    </View>
  );
}

/** The child's own line: the words, then Undo and the way into its detail where they apply. */
function HistoryRow({ item, currency, look }: { item: HistoryItem; currency: string; look: Look }) {
  const router = useRouter();
  const tokens = useTokens();
  const undo = useUndo();
  const sendOnce = useSendOnce();
  const [note, setNote] = useState<{ text: string; bad: boolean }>();

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
      <HistoryLine
        item={item}
        currency={currency}
        look={look}
        actions={
          <>
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
            {opensDetail(item) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={entryDetailCopy.detailsFor(item.label)}
                onPress={() => router.push(`/(child)/entry/${item.entryId}`)}
                className="h-11 w-11 items-center justify-center rounded-full"
              >
                <ChevronRightIcon size={20} color={tokens["muted-foreground"]} />
              </Pressable>
            ) : null}
          </>
        }
      />
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
