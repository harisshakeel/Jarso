import { dashboardCopy, type TimelineEvent, weekday } from "@jarso/core/dashboard";
import { CoinsIcon, GiftIcon, TargetIcon } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/screen";
import { Text } from "@/components/ui";
import { useTokens } from "@/lib";

const ICONS = { allowance: CoinsIcon, gift: GiftIcon, goal: TargetIcon } as const;

/**
 * The next two weeks (the web's TimelineCard): allowances falling due, planned gifts and goals
 * the plan reaches, grouped by day.
 */
export function TimelineCard({ events }: { events: TimelineEvent[] }) {
  const tokens = useTokens();
  const days = [...new Set(events.map((event) => event.date))];
  return (
    <Card className="rounded-3xl p-4">
      <Text accessibilityRole="header" className="font-sans-bold text-h2">
        {dashboardCopy.timelineTitle}
      </Text>
      {events.length === 0 ? (
        <Text className="text-muted-foreground">{dashboardCopy.timelineEmpty}</Text>
      ) : (
        days.map((date) => (
          <View key={date} className="gap-1.5">
            <Text className="font-sans-semibold text-small text-muted-foreground">
              {weekday(date)}
            </Text>
            {events
              .filter((event) => event.date === date)
              .map((event) => {
                const Icon = ICONS[event.kind];
                return (
                  <View
                    key={`${event.childId}-${event.kind}-${event.text}`}
                    accessible
                    accessibilityLabel={`${event.nickname}: ${event.text}`}
                    className="flex-row items-center gap-2"
                  >
                    <Icon size={16} color={tokens["muted-foreground"]} />
                    <Text className="min-w-0 flex-1">
                      <Text className="font-sans-semibold">{event.nickname}</Text> · {event.text}
                    </Text>
                  </View>
                );
              })}
          </View>
        ))
      )}
    </Card>
  );
}
