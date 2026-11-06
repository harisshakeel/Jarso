import { weekSpentBars, weekSpentCopy } from "@jarso/core/ledger";
import type { FamilyContext } from "@jarso/data/family";
import { getHistorySince } from "@jarso/data/ledger";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Card } from "@/components/screen";
import { Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { formatMoney, startOfWeek } from "@/lib";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** A bar never shrinks below this share, so its emoji and amount still fit. */
const MIN_SHARE = 0.12;

/**
 * The child's week on the Diary as a picture: what they spent this week, then up to three bars
 * (one per biggest category, width by amount, the amount on each). Shares `keys.week` with
 * "Where your money went". Nice to have: hidden while loading or if it can't load.
 */
export function WeekSpentCard({ context }: { context: FamilyContext }) {
  const { userId } = useSession();
  const week = useQuery({
    queryKey: keys.week(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () =>
      getHistorySince(supabase, userId as string, startOfWeek(context.today), {
        timezone: context.timezone,
        now: Date.now(),
      }),
  });
  if (!week.data) return null;
  const money = (minor: number) => formatMoney(minor, context.currency, { showMinor: "nonzero" });
  const { totalMinor, bars } = weekSpentBars(week.data, context.today);
  return (
    <Card className="gap-2">
      <Text className="font-sans-bold text-small text-muted-foreground">
        {weekSpentCopy.heading}
      </Text>
      <Text className="font-sans-extrabold text-money-xl">{money(totalMinor)}</Text>
      {bars.length === 0 ? (
        <Text className="text-muted-foreground">{weekSpentCopy.empty}</Text>
      ) : (
        <View className="gap-1.5">
          {bars.map((bar) => (
            <View
              key={bar.key}
              testID="week-bar"
              accessible
              accessibilityLabel={`${bar.label} ${money(bar.totalMinor)}`}
              className="flex-row items-center"
            >
              <View
                className="h-9 flex-row items-center gap-1.5 rounded-full bg-primary px-3"
                style={{ width: `${Math.max(MIN_SHARE, bar.share) * 100}%` }}
              >
                <Text className="text-small">{bar.emoji}</Text>
                <Text
                  numberOfLines={1}
                  className="font-sans-bold text-primary-foreground text-small"
                >
                  {money(bar.totalMinor)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
