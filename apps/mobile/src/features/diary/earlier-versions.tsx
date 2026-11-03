import { entryDetailCopy } from "@jarso/core/diary";
import { categoryOf, type HistoryItem } from "@jarso/core/ledger";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Notice } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { formatMoney, toUserMessage } from "@/lib";
import { useEntryVersions } from "./use-entry-versions";

/**
 * What a line said before it was fixed, newest first. A fixed line shows them at once (tapping
 * its "Fixed · was" note lands here); any other line loads them on request.
 */
export function EarlierVersions({ item, currency }: { item: HistoryItem; currency: string }) {
  const [asked, setAsked] = useState(Boolean(item.fixedFrom));
  const versions = useEntryVersions(item.entryId ?? "", asked && Boolean(item.entryId));
  const kind = item.kind === "received" ? "received" : "purchase";

  if (!asked || (versions.isPending && !versions.error)) {
    return (
      <Button
        variant="ghost"
        accessibilityLabel={entryDetailCopy.earlierVersions}
        accessibilityState={{ busy: asked, disabled: asked }}
        disabled={asked}
        onPress={() => setAsked(true)}
      >
        {asked ? <ActivityIndicator /> : <Text>{entryDetailCopy.earlierVersions}</Text>}
      </Button>
    );
  }
  if (!versions.data) return <Notice message={toUserMessage(versions.error)} />;
  if (versions.data.length === 0) {
    return <Text className="text-muted-foreground">{entryDetailCopy.noEarlierVersions}</Text>;
  }
  return (
    <View accessibilityLabel={entryDetailCopy.earlierVersions} className="gap-1">
      {versions.data.map((v) => (
        <Text key={v.id} testID="earlier-version" className="text-muted-foreground">
          {`${formatMoney(v.amountMinor, currency, { showMinor: "nonzero" })} · ${categoryOf(v.category, kind).label}${v.label ? ` · ${v.label}` : ""}`}
        </Text>
      ))}
    </View>
  );
}
