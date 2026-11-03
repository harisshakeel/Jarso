import {
  allowanceSummaryCopy,
  cadenceAfterAmount,
  describeAllowanceState,
  runningSchedule,
  type Schedule,
} from "@jarso/core/allowance";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Card } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { AutoChargeSlot } from "@/features/payments";
import { formatMoney } from "@/lib";

/**
 * The allowance on the child hub (the web's ParentAllowanceCard): amount and how often, where it
 * stands, and one action, Manage or Set up, opening the allowance page.
 */
export function AllowanceCard({
  childId,
  schedule,
  currency,
}: {
  childId: string;
  /** The child's latest schedule (stopped included), or null. */
  schedule: Schedule | null;
  currency: string;
}) {
  const router = useRouter();
  const running = runningSchedule(schedule);
  const action = running ? allowanceSummaryCopy.manage : allowanceSummaryCopy.setUp;
  return (
    <Card>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {allowanceSummaryCopy.title}
      </Text>
      {running ? (
        <View className="flex-row flex-wrap items-baseline gap-x-2">
          <Text className="font-sans-extrabold text-money">
            {formatMoney(running.amountMinor, currency)}
          </Text>
          <Text className="font-sans-semibold text-muted-foreground">
            {cadenceAfterAmount(running.frequency, running.anchorOn)}
          </Text>
        </View>
      ) : null}
      <Text className={running ? "font-sans-semibold" : "text-muted-foreground"}>
        {describeAllowanceState(schedule)}
      </Text>
      {running ? <AutoChargeSlot target={{ kind: "schedule", id: running.id }} /> : null}
      <Button
        className="self-start"
        variant={running ? "secondary" : "default"}
        accessibilityLabel={action}
        onPress={() => router.push(`/(parent)/children/${childId}/allowance`)}
      >
        <Text>{action}</Text>
      </Button>
    </Card>
  );
}
