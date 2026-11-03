import {
  entryDetailCopy,
  notEnoughSaveMessage,
  notEnoughSpendToUndoMessage,
  undoneReceivedMessage,
  undoneSpendMessage,
} from "@jarso/core/diary";
import { categoryOf, type HistoryItem } from "@jarso/core/ledger";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Notice, SentView, SubmitButton, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { actionErrorMessage, formatMoney } from "@/lib";
import { EarlierVersions } from "./earlier-versions";
import { FixForm } from "./fix-form";
import { useUndo } from "./use-undo";

/**
 * A diary line, opened: fix it, take it back, or look at what it said before. Fixes and Undo
 * need a connection. The child's own lines only.
 */
export function EntryDetail({
  item,
  currency,
  onClose,
}: {
  item: HistoryItem;
  currency: string;
  onClose: () => void;
}) {
  const [fixing, setFixing] = useState(false);
  const [done, setDone] = useState<string>();
  const kind = item.kind === "received" ? "received" : "purchase";
  if (done) return <SentView message={done} onClose={onClose} />;

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-6 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {`${categoryOf(item.category, kind).emoji} ${item.label}`}
        </Text>
        {item.amountMinor === null ? null : (
          <Text className="text-muted-foreground">
            {formatMoney(item.amountMinor, currency, { showMinor: "nonzero" })}
          </Text>
        )}
      </View>
      {fixing ? (
        <FixForm item={item} currency={currency} onDone={() => setDone(entryDetailCopy.fixed)} />
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2">
            {item.canFix ? (
              <Button
                size="lg"
                accessibilityLabel={entryDetailCopy.fix}
                onPress={() => setFixing(true)}
              >
                <Text>{entryDetailCopy.fix}</Text>
              </Button>
            ) : null}
          </View>
          {item.canUndo && item.entryId ? <UndoControl item={item} onUndone={setDone} /> : null}
          {item.entryId ? <EarlierVersions item={item} currency={currency} /> : null}
        </>
      )}
    </ScrollView>
  );
}

function UndoControl({ item, onUndone }: { item: HistoryItem; onUndone: (line: string) => void }) {
  const undo = useUndo();
  const once = useSendOnce();
  const [error, setError] = useState<string>();
  const run = () =>
    once(async () => {
      setError(undefined);
      try {
        const result = await undo.mutateAsync(item.entryId as string);
        if (result === "not_enough_spend") return setError(notEnoughSpendToUndoMessage);
        if (result === "not_enough_save") return setError(notEnoughSaveMessage);
        onUndone(item.kind === "received" ? undoneReceivedMessage : undoneSpendMessage);
      } catch (failure) {
        setError(await actionErrorMessage(failure));
      }
    });
  return (
    <View className="gap-2">
      <SubmitButton
        label={entryDetailCopy.undo}
        pending={undo.isPending}
        onPress={() => void run()}
      />
      <Notice message={error} />
    </View>
  );
}
