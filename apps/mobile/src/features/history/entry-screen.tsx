import { diaryCopy } from "@jarso/core/diary";
import type { HistoryItem } from "@jarso/core/ledger";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { EntryDetail } from "@/features/diary";
import { toUserMessage } from "@/lib";
import { useHistory } from "./use-history";

/**
 * One diary line, opened from the Diary: fix it, take it back, or see what it said before. The
 * line is kept once found: a fix posts a new line with a new id, so the refreshed history no
 * longer has this one, and the "Fixed." screen must stay until the child closes it.
 */
export function EntryRoute() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const { history, home } = useHistory();
  const [kept, setKept] = useState<HistoryItem | null>(null);
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(child)/(tabs)/diary");

  const found = history.data?.pages
    .flatMap((page) => page.items)
    .find((line) => line.entryId === entryId);
  // Kept from the first read: later reads may not have it (a fix replaces the line).
  if (found && kept === null) setKept(found);
  const item = kept ?? found;
  const currency = home.data?.context.currency;

  if (item && currency) {
    return (
      <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
        <EntryDetail item={item} currency={currency} onClose={close} />
      </SafeAreaView>
    );
  }

  const error = history.error ?? home.error;
  const loaded = Boolean(history.data && home.data);
  if (!error && !loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  return (
    <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
      <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
        {error ? toUserMessage(error) : diaryCopy.notFound}
      </Text>
      <Button size="lg" accessibilityLabel={diaryCopy.backToDiary} onPress={close}>
        <Text>{diaryCopy.backToDiary}</Text>
      </Button>
    </View>
  );
}
