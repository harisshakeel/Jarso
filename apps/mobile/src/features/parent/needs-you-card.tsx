import { type ChildDueItem, dueKindLabel, formatDay, needsYouCopy } from "@jarso/core/allowance";
import { useRouter } from "expo-router";
import { CheckIcon } from "lucide-react-native";
import { Fragment } from "react";
import { View } from "react-native";
import { Card, CardSeparator } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { type FamilyRequestItem, ParentRequestItems } from "@/features/requests";
import { formatMoney, useTokens } from "@/lib";

/** The web's calm line for requests that could not be read, so it never looks like "none". */
function unavailableLine(names: string[]): string {
  const who = names.length > 0 ? ` for ${names.join(" and ")}` : "";
  return `We couldn't load requests${who} just now. Refresh to try again.`;
}

/**
 * The first thing on the parent's Home (mockup C): one card with the requests to decide on and
 * every allowance and gift waiting to be handed over, each with its own action. With nothing
 * waiting it shrinks to an "All caught up." chip.
 */
export function NeedsYouCard({
  requests,
  failed,
  due,
  currency,
}: {
  requests: FamilyRequestItem[];
  /** Children whose requests could not be read. */
  failed: string[];
  due: ChildDueItem[];
  currency: string;
}) {
  const tokens = useTokens();
  const router = useRouter();
  const waiting = requests.length + due.length;

  if (waiting === 0 && failed.length === 0) {
    return (
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${needsYouCopy.title}: ${needsYouCopy.allCaughtUp}`}
        className="min-h-9 flex-row items-center gap-1.5 self-start rounded-full bg-secondary px-3"
      >
        <CheckIcon size={16} color={tokens.primary} />
        <Text className="font-sans-semibold text-small text-primary">
          {needsYouCopy.allCaughtUp}
        </Text>
      </View>
    );
  }

  return (
    <Card>
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="font-sans-bold text-h2">
          {needsYouCopy.title}
        </Text>
        {waiting > 0 ? (
          <View
            accessible
            accessibilityLabel={`${waiting}${needsYouCopy.waiting}`}
            className="min-w-7 items-center rounded-full bg-primary px-2 py-0.5"
          >
            <Text className="font-sans-bold text-caption text-primary-foreground">{waiting}</Text>
          </View>
        ) : null}
      </View>
      <ParentRequestItems items={requests} currency={currency} />
      {failed.length > 0 ? (
        <Text accessibilityRole="text" className="text-small text-muted-foreground">
          {unavailableLine(failed)}
        </Text>
      ) : null}
      {due.map((item, index) => {
        const day = formatDay(item.dueOn);
        return (
          <Fragment key={`${item.kind}-${item.id}`}>
            {requests.length > 0 || index > 0 ? <CardSeparator /> : null}
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className="font-sans-bold">
                  {item.nickname} · {dueKindLabel(item.kind)}
                  {item.note ? <Text className="text-muted-foreground"> · {item.note}</Text> : null}
                </Text>
                <Text className="text-small text-muted-foreground">
                  {needsYouCopy.due(day)} · {formatMoney(item.amountMinor, currency)}
                </Text>
              </View>
              <Button
                variant="secondary"
                size="sm"
                accessibilityLabel={needsYouCopy.handOverLabel(item.kind, item.nickname, day)}
                onPress={() =>
                  router.push(`/(parent)/children/${item.childId}/handover/${item.kind}/${item.id}`)
                }
              >
                <Text>{needsYouCopy.handOver}</Text>
              </Button>
            </View>
          </Fragment>
        );
      })}
    </Card>
  );
}
