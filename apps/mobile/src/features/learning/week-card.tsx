import { type WeeklyReview, weekCopy, weekDay, weekSentence } from "@jarso/core/review";
import { useRouter } from "expo-router";
import { CalendarCheckIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";

/**
 * The weekly review (FR11), the web's WeekCard on its own page: the week in a sentence; the
 * goal; one decision and its effect; a skill shown and one worth another look; a fresh question.
 */
export function WeekCard({ review, currency }: { review: WeeklyReview; currency: string }) {
  const router = useRouter();
  const tokens = useTokens();
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const { money: week, goal, topCategory, decision, understood, practise, question } = review;
  return (
    <View className="gap-4 rounded-2xl bg-card p-5">
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <CalendarCheckIcon size={16} color={tokens["muted-foreground"]} />
          <Text className="font-sans-bold text-muted-foreground text-caption uppercase">
            {weekCopy.range(weekDay(week.weekStart), weekDay(week.weekEnd))}
          </Text>
        </View>
        <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
          {weekCopy.heading}
        </Text>
      </View>

      <Text>{weekSentence(week, money)}</Text>
      {topCategory ? (
        <Text className="text-muted-foreground">{weekCopy.mostWentOn(topCategory.label)}</Text>
      ) : null}
      {week.stillDueMinor > 0 ? (
        <Text className="text-muted-foreground">
          {weekCopy.stillDue(money(week.stillDueMinor))}
        </Text>
      ) : null}

      {goal.kind === "progress" ? (
        <Text>
          {weekCopy.goalProgress(
            goal.emoji,
            goal.name,
            money(goal.countedMinor),
            money(goal.targetMinor),
          )}
          {goal.paymentsLeft !== null
            ? weekCopy.paymentsLeft(goal.paymentsLeft)
            : weekCopy.remaining(money(goal.remainingMinor))}
        </Text>
      ) : goal.kind === "reached" ? (
        <Text>{weekCopy.goalReached(goal.emoji, goal.name)}</Text>
      ) : null}

      {decision ? (
        <View className="gap-1 rounded-xl bg-secondary p-4">
          <Text
            accessibilityRole="header"
            className="font-sans-bold text-secondary-foreground text-caption uppercase"
          >
            {weekCopy.oneDecision}
          </Text>
          <Text className="font-sans-semibold text-secondary-foreground">{decision.what}</Text>
          <Text className="text-secondary-foreground">{decision.effect}</Text>
        </View>
      ) : (
        <Text className="text-muted-foreground">{weekCopy.planSame}</Text>
      )}

      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="font-sans-bold text-muted-foreground text-caption uppercase"
        >
          {weekCopy.learning}
        </Text>
        {understood ? (
          <Text>
            {`${weekCopy.showedYouCan} `}
            <Text className="font-sans-semibold">{understood.label.toLowerCase()}</Text>
            {weekCopy.goodThinking}
          </Text>
        ) : null}
        {practise ? (
          <Text className="text-muted-foreground">
            {weekCopy.worthAnotherLook(practise.label.toLowerCase())}
          </Text>
        ) : !understood ? (
          <Text className="text-muted-foreground">{weekCopy.firstSkill}</Text>
        ) : null}
      </View>

      {question ? (
        <Button
          size="lg"
          accessibilityLabel={weekCopy.freshQuestion}
          className="self-start"
          onPress={() => router.push("/(child)/learn/week-question")}
        >
          <Text>{weekCopy.freshQuestion}</Text>
        </Button>
      ) : null}
    </View>
  );
}
