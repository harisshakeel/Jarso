import {
  type Jar,
  type Jars,
  jarPageCopy,
  jarPageFill,
  weekLine,
  weeklyTotals,
} from "@jarso/core/ledger";
import type { FamilyContext } from "@jarso/data/family";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Card } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useGoal } from "@/features/goals";
import { useParentLabel, useProgress } from "@/features/progress";
import { formatMoney, toUserMessage } from "@/lib";
import { useBalanceHistory } from "./use-balance-history";
import { useHome } from "./use-jars";
import { WeeklyBars } from "./weekly-bars";

/** One jar's page: big jar + amount, six weekly bars, one sentence, the jar's two actions. */
export function JarScreen({ jar }: { jar: Jar }) {
  const home = useHome();
  if (!home.data) {
    return (
      <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
        {home.error ? (
          <>
            <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
              {toUserMessage(home.error)}
            </Text>
            <Button size="lg" accessibilityLabel="Try again" onPress={() => void home.refetch()}>
              <Text>Try again</Text>
            </Button>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading your jar" />
        )}
      </View>
    );
  }
  return (
    <JarPage
      jar={jar}
      jars={home.data.jars}
      context={home.data.context}
      refreshing={home.isRefetching}
      onRefresh={() => void home.refetch()}
    />
  );
}

function JarPage({
  jar,
  jars,
  context,
  refreshing,
  onRefresh,
}: {
  jar: Jar;
  jars: Jars;
  context: FamilyContext;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const goal = useGoal();
  const progress = useProgress();
  const parent = useParentLabel();
  const history = useBalanceHistory(jars, context);
  const totals = useMemo(
    () => (history.data ? weeklyTotals(history.data, jar, context.today) : null),
    [history.data, jar, context.today],
  );

  const { currency } = context;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const balance = jars[jar];
  const fill = jarPageFill(jar, {
    spendMinor: jars.spend,
    saveMinor: jars.save,
    goalTargetMinor: goal.data?.goal.targetMinor ?? null,
  });
  const caption = jar === "save" ? jarPageCopy.caption.save(parent) : jarPageCopy.caption.spend;
  const [first, second] =
    jar === "save" ? jarPageCopy.actions.save(parent) : jarPageCopy.actions.spend;
  const current = totals?.at(-1)?.amountMinor ?? 0;
  const mood = jar === "spend" || current < 0 ? "happy" : "cheer";

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card className="items-center gap-2 py-5">
        <Jarso tint={jar} fill={fill} look={progress.data?.look} size={120} />
        <Text
          className={
            jar === "save"
              ? "font-sans-extrabold text-gold-text text-money-l"
              : "font-sans-extrabold text-money-l"
          }
        >
          {money(balance)}
        </Text>
        <Text className="text-muted-foreground">{caption}</Text>
      </Card>

      {totals ? (
        <>
          <Card>
            <Text accessibilityRole="header" className="font-sans-bold text-h3">
              {jarPageCopy.barsHeading[jar]}
            </Text>
            <WeeklyBars jar={jar} totals={totals} currency={currency} />
          </Card>
          <View className="flex-row items-center gap-3">
            <Jarso mood={mood} size={50} />
            <View className="flex-1 rounded-xl border border-border bg-card px-4 py-3">
              <Text className="font-sans-bold">{weekLine(totals, jar, money)}</Text>
            </View>
          </View>
        </>
      ) : null}

      <View className="gap-3">
        <JarAction
          variant={jar === "save" ? "keycap-gold" : "keycap"}
          action={first}
          onPress={() => router.push(first.href)}
        />
        <JarAction
          variant="keycap-white"
          action={second}
          onPress={() => router.push(second.href)}
        />
      </View>
    </ScrollView>
  );
}

function JarAction({
  variant,
  action,
  onPress,
}: {
  variant: "keycap" | "keycap-gold" | "keycap-white";
  action: { label: string; hint: string };
  onPress: () => void;
}) {
  return (
    <Button
      size="lg"
      variant={variant}
      accessibilityLabel={action.label}
      accessibilityHint={action.hint}
      onPress={onPress}
    >
      <Text>{action.label}</Text>
    </Button>
  );
}
