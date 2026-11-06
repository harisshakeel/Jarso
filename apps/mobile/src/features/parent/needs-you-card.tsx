import { type ChildDueItem, needsYouCopy } from "@jarso/core/allowance";
import { familyCardsCopy } from "@jarso/core/dashboard";
import { View } from "react-native";
import { Jarso } from "@/components/brand";
import { Eyebrow } from "@/components/screen";
import { Text } from "@/components/ui";
import { HandoverCard } from "@/features/allowance";
import { type FamilyRequestItem, ParentRequestItems } from "@/features/requests";

/** The web's calm line for requests that could not be read, so it never looks like "none". */
function unavailableLine(names: string[]): string {
  const who = names.length > 0 ? ` for ${names.join(" and ")}` : "";
  return `We couldn't load requests${who} just now. Refresh to try again.`;
}

/**
 * The first thing on the parent's Family tab (mockup PA1): "Needs you · 2", then each ask as a
 * card answered in one tap and each allowance or gift due as a handover card. With nothing
 * waiting it shrinks to Jarso and "All caught up."
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
  const waiting = requests.length + due.length;

  if (waiting === 0 && failed.length === 0) {
    return (
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${needsYouCopy.title}: ${needsYouCopy.allCaughtUp}`}
        className="flex-row items-center gap-2 self-start rounded-full bg-tint-teal py-1 pr-4 pl-1"
      >
        <Jarso mood="happy" size={36} />
        <Text className="font-sans-semibold text-primary">{needsYouCopy.allCaughtUp}</Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Eyebrow header tone="muted">
        {familyCardsCopy.needsYou(waiting)}
      </Eyebrow>
      <ParentRequestItems items={requests} currency={currency} />
      {failed.length > 0 ? (
        <Text accessibilityRole="text" className="text-small text-muted-foreground">
          {unavailableLine(failed)}
        </Text>
      ) : null}
      {due.map((item) => (
        <HandoverCard
          key={`${item.kind}-${item.id}`}
          childId={item.childId}
          item={item}
          currency={currency}
          nickname={item.nickname}
        />
      ))}
    </View>
  );
}
