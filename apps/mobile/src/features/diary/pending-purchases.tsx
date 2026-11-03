import { entrySavedMessage, pendingCopy, purchaseSchema } from "@jarso/core/diary";
import { type OutboxItem, offlineCopy, showsAsPending } from "@jarso/core/offline";
import { useRouter } from "expo-router";
import { HourglassIcon } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";
import { removeItem, sendItem, useOnline, useOutboxItems } from "@/lib/outbox";

/** The form's own strings, as stored in the outbox payload. */
function draftOf(item: OutboxItem): { amount: string; label: string; category: string } {
  const payload = (item.payload ?? {}) as { amount?: unknown; label?: unknown; category?: unknown };
  return {
    amount: typeof payload.amount === "string" ? payload.amount : "",
    label: typeof payload.label === "string" ? payload.label : "",
    category: typeof payload.category === "string" ? payload.category : "",
  };
}

/**
 * Purchases kept on this phone that the server hasn't taken yet: waiting to send, or refused
 * and needing a look. The Spend jar stays the server's balance; nothing here is taken off it.
 */
export function PendingPurchases({ userId, currency }: { userId: string; currency: string }) {
  const online = useOnline();
  const stored = useOutboxItems(userId).filter((item) => item.kind === "purchase");
  // A purchase mid-way through its first online send isn't news: it shows once that has failed.
  const items = stored.filter((item) => showsAsPending(item, online));
  if (items.length === 0) return null;
  return (
    <View
      accessibilityLabel={pendingCopy.heading}
      className="gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {pendingCopy.heading}
      </Text>
      {items.map((item) => (
        <PendingLine key={item.id} item={item} currency={currency} />
      ))}
    </View>
  );
}

function PendingLine({ item, currency }: { item: OutboxItem; currency: string }) {
  const router = useRouter();
  const tokens = useTokens();
  const [asked, setAsked] = useState(false);
  const [note, setNote] = useState<string>();
  const [checking, setChecking] = useState(false);
  const parsed = purchaseSchema(currency).safeParse(item.payload);
  const amount = parsed.success
    ? formatMoney(parsed.data.amountMinor, currency, { showMinor: "nonzero" })
    : null;
  const label = (parsed.success && parsed.data.label) || pendingCopy.fallbackLabel;

  const change = () =>
    router.push({ pathname: "/(child)/purchase", params: { change: item.id, ...draftOf(item) } });

  /**
   * An expired purchase may have reached the server already (a reply lost on the way back), so
   * it is sent once more with its own key first: a replay never records twice. Only a refusal
   * opens the form, which brings a new key.
   */
  async function onChange() {
    if (item.message !== offlineCopy.expired) return change();
    if (checking) return;
    setChecking(true);
    setNote(undefined);
    try {
      const outcome = await sendItem(item);
      if (outcome.kind === "done") {
        await removeItem(item.id).catch(() => undefined);
        setNote(entrySavedMessage);
      } else if (outcome.kind === "refused") {
        change();
      } else {
        setNote(offlineCopy.offline);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="min-w-0 flex-1">{label}</Text>
        {amount ? <Text className="font-sans-bold">−{amount}</Text> : null}
      </View>
      {item.status === "needs_look" ? (
        <>
          <Text className="text-muted-foreground">{item.message ?? offlineCopy.refused}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="outline"
              accessibilityLabel={pendingCopy.changeFor(label)}
              accessibilityState={{ busy: checking, disabled: checking }}
              disabled={checking}
              onPress={() => void onChange()}
            >
              {checking ? <ActivityIndicator /> : <Text>{pendingCopy.change}</Text>}
            </Button>
            <Button
              variant="outline"
              accessibilityLabel={pendingCopy.askAParentFor(label)}
              onPress={() => setAsked(true)}
            >
              <Text>{pendingCopy.askAParent}</Text>
            </Button>
            <Button
              variant="ghost"
              accessibilityLabel={pendingCopy.removeFor(label)}
              onPress={() => void removeItem(item.id).catch(() => undefined)}
            >
              <Text>{pendingCopy.remove}</Text>
            </Button>
          </View>
          {note ? (
            <Text accessibilityLiveRegion="polite" className="rounded-lg bg-muted px-3.5 py-2.5">
              {note}
            </Text>
          ) : null}
          {asked ? (
            <Text accessibilityLiveRegion="polite" className="rounded-lg bg-muted px-3.5 py-2.5">
              {pendingCopy.askAParentNote}
            </Text>
          ) : null}
        </>
      ) : (
        <View className="flex-row items-start gap-1.5">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <HourglassIcon size={16} color={tokens["muted-foreground"]} />
          </View>
          <Text className="min-w-0 flex-1 text-muted-foreground">{offlineCopy.waiting}</Text>
        </View>
      )}
    </View>
  );
}
