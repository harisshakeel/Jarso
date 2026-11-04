import { type DashboardChild, dashboardCopy } from "@jarso/core/dashboard";
import { useRouter } from "expo-router";
import { Fragment } from "react";
import { Pressable, View } from "react-native";
import { Card, CardSeparator } from "@/components/screen";
import { Text } from "@/components/ui";
import { dayOfDate, formatMoney } from "@/lib";

/** The child's newest money line, "Bought lunch · 3 Nov", or nothing before their first. */
function lastActivity(child: DashboardChild): string | null {
  const latest = child.history.find((item) => !item.undone);
  return latest ? `${latest.label} · ${dayOfDate(latest.occurredOn)}` : null;
}

/**
 * The children as rows in one card (mockup C, lists over stacked cards): initial, nickname, their
 * newest money line, the total in Money and the Spend · Save split under it, Save in gold. A row
 * opens the child's hub.
 */
export function ChildrenList({
  items,
  currency,
  title = true,
}: {
  items: DashboardChild[];
  currency: string;
  /** The card's own "Children" heading, off where the screen title already says it. */
  title?: boolean;
}) {
  const router = useRouter();
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <Card className="gap-0 py-1.5">
      {title ? (
        <Text accessibilityRole="header" className="pt-2 pb-1 font-sans-bold text-h2">
          {dashboardCopy.childrenTitle}
        </Text>
      ) : null}
      {items.map((child, index) => {
        const total = money(child.spendMinor + child.saveMinor);
        const spend = money(child.spendMinor);
        const save = money(child.saveMinor);
        const activity = lastActivity(child);
        return (
          <Fragment key={child.id}>
            {index > 0 ? <CardSeparator /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${child.nickname}, ${total}. ${dashboardCopy.spend}${spend}, ${dashboardCopy.save}${save}`}
              accessibilityHint={activity ?? undefined}
              onPress={() => router.push(`/(parent)/children/${child.id}`)}
              className="min-h-12 flex-row items-center gap-3 py-2.5 active:opacity-70"
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="h-10 w-10 items-center justify-center rounded-full bg-muted"
              >
                <Text className="font-sans-extrabold">
                  {child.nickname.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className="font-sans-bold">
                  {child.nickname}
                </Text>
                {activity ? (
                  <Text numberOfLines={1} className="text-small text-muted-foreground">
                    {activity}
                  </Text>
                ) : null}
              </View>
              <View className="items-end gap-0.5">
                <Text className="font-sans-bold text-money">{total}</Text>
                <Text className="text-small text-muted-foreground">
                  <Text className="text-small text-muted-foreground">{spend}</Text>
                  {" · "}
                  <Text className="text-small text-gold-text">{save}</Text>
                </Text>
              </View>
            </Pressable>
          </Fragment>
        );
      })}
    </Card>
  );
}
