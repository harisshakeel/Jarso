import {
  type DueItem,
  dueKindLabel,
  dueListCopy,
  formatDay,
  needsYouCopy,
} from "@jarso/core/allowance";
import { familyCardsCopy } from "@jarso/core/dashboard";
import { useRouter } from "expo-router";
import { CalendarClockIcon, GiftIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";

/**
 * An allowance or gift waiting to be handed over, as a card (mockup PA1): what and how much, the
 * due day, and a gold "Hand over" keycap that opens the handover sheet, where the money moves.
 * With a nickname (the Family tab) the card names the child.
 */
export function HandoverCard({
  childId,
  item,
  currency,
  nickname,
}: {
  childId: string;
  item: DueItem;
  currency: string;
  nickname?: string;
}) {
  const router = useRouter();
  const tokens = useTokens();
  const Icon = item.kind === "gift" ? GiftIcon : CalendarClockIcon;
  const day = formatDay(item.dueOn);
  const amount = formatMoney(item.amountMinor, currency);
  const what = `${dueKindLabel(item.kind)} · ${amount}`;
  const title = nickname ? `${nickname} · ${what}` : what;
  const withNote = item.note
    ? `${dueKindLabel(item.kind)} · ${item.note}`
    : dueKindLabel(item.kind);
  const label = nickname
    ? needsYouCopy.handOverLabel(item.kind, nickname, day)
    : `${dueListCopy.handOver}: ${withNote}, ${dueListCopy.due(day)}, ${amount}`;

  return (
    <View className="gap-3 rounded-3xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="h-11 w-11 items-center justify-center rounded-2xl bg-tint-gold"
        >
          <Icon size={22} color={tokens["gold-text"]} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-sans-bold text-h3">{title}</Text>
          <Text className="text-small text-muted-foreground">
            {familyCardsCopy.dueLine(day, item.note)}
          </Text>
        </View>
      </View>
      <Button
        size="sm"
        variant="keycap-gold"
        accessibilityLabel={label}
        onPress={() =>
          router.push(`/(parent)/children/${childId}/handover/${item.kind}/${item.id}`)
        }
      >
        <Text>{familyCardsCopy.handOver}</Text>
      </Button>
    </View>
  );
}
