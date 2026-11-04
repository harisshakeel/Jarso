import {
  type DueItem,
  dueKindLabel,
  dueListCopy,
  formatDay,
  type Gift,
} from "@jarso/core/allowance";
import { useRouter } from "expo-router";
import { Fragment } from "react";
import { Card, CardSeparator, ListRow } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { formatMoney } from "@/lib";

function withNote(title: string, note: string | null): string {
  return note ? `${title} · ${note}` : title;
}

/** What is waiting for the parent to hand over. Each row opens the handover sheet. */
export function DueList({
  childId,
  items,
  currency,
}: {
  childId: string;
  items: DueItem[];
  currency: string;
}) {
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <Card className="gap-1">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {dueListCopy.dueTitle}
      </Text>
      {items.map((item, index) => {
        const label = withNote(dueKindLabel(item.kind), item.note);
        const day = dueListCopy.due(formatDay(item.dueOn));
        const amount = formatMoney(item.amountMinor, currency);
        return (
          <Fragment key={`${item.kind}-${item.id}`}>
            {index > 0 ? <CardSeparator /> : null}
            <ListRow
              label={label}
              detail={day}
              trailing={<Text className="font-sans-bold text-money">{amount}</Text>}
              accessibilityLabel={`${dueListCopy.handOver}: ${label}, ${day}, ${amount}`}
              onPress={() =>
                router.push(`/(parent)/children/${childId}/handover/${item.kind}/${item.id}`)
              }
            />
          </Fragment>
        );
      })}
    </Card>
  );
}

/**
 * Gifts set for a later day, each opening its edit page, then "Give a gift". Shown with no gifts
 * too, so adding one is always a tap away.
 */
export function GiftList({
  childId,
  gifts,
  currency,
}: {
  childId: string;
  gifts: Gift[];
  currency: string;
}) {
  const router = useRouter();
  return (
    <Card className="gap-1">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {dueListCopy.giftsTitle}
      </Text>
      {gifts.map((gift, index) => {
        const label = withNote(dueListCopy.gift, gift.note);
        const day = dueListCopy.on(formatDay(gift.giveOn));
        const amount = formatMoney(gift.amountMinor, currency);
        return (
          <Fragment key={gift.id}>
            {index > 0 ? <CardSeparator /> : null}
            <ListRow
              label={label}
              detail={day}
              trailing={<Text className="font-sans-bold text-money">{amount}</Text>}
              accessibilityLabel={`${dueListCopy.edit}: ${label}, ${day}, ${amount}`}
              onPress={() => router.push(`/(parent)/children/${childId}/gifts/${gift.id}`)}
            />
          </Fragment>
        );
      })}
      <Button
        className="mt-2 self-start"
        variant="secondary"
        accessibilityLabel={dueListCopy.giveGift}
        onPress={() => router.push(`/(parent)/children/${childId}/gifts/new`)}
      >
        <Text>{dueListCopy.giveGift}</Text>
      </Button>
    </Card>
  );
}
