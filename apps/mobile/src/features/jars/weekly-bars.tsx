import { isBestWeek, type Jar, jarPageCopy, type WeekTotal } from "@jarso/core/ledger";
import { View } from "react-native";
import { Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";

const PLOT_HEIGHT = 120;
const MIN_SHARE = 0.03;

/**
 * Six bars, the number on top of each and the week under it; this week is solid and the earlier
 * ones lighter. A week the jar lost money is a muted stub with a minus sign, never red. No axes:
 * the numbers are the chart. One accessible summary; the drawing is hidden from screen readers.
 */
export function WeeklyBars({
  jar,
  totals,
  currency,
}: {
  jar: Jar;
  totals: WeekTotal[];
  currency: string;
}) {
  const tokens = useTokens();
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const label = (minor: number) => (minor < 0 ? `−${money(-minor)}` : money(minor));
  const biggest = Math.max(1, ...totals.map((week) => Math.abs(week.amountMinor)));
  const color = jar === "save" ? tokens.gold : tokens.primary;
  const summary = totals.map((week) => `${week.label} ${label(week.amountMinor)}`).join(", ");

  return (
    <View>
      {isBestWeek(totals) ? (
        <View className="mb-2 self-start rounded-full bg-gold px-3 py-1">
          <Text className="font-sans-bold text-gold-foreground text-small">
            {jarPageCopy.bestWeek}
          </Text>
        </View>
      ) : null}
      <View accessible accessibilityLabel={jarPageCopy.barsLabel(jar, summary)}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="flex-row gap-2"
        >
          {totals.map((week) => {
            const negative = week.amountMinor < 0;
            const share = Math.max(Math.abs(week.amountMinor) / biggest, MIN_SHARE);
            return (
              <View key={week.weekStart} className="flex-1 items-center gap-1">
                <Text
                  className={
                    week.current ? "font-sans-bold text-small" : "text-muted-foreground text-small"
                  }
                >
                  {label(week.amountMinor)}
                </Text>
                <View className="w-full justify-end" style={{ height: PLOT_HEIGHT }}>
                  <View
                    testID={week.current ? "bar-current" : undefined}
                    className={
                      negative || week.amountMinor === 0 ? "rounded-md bg-muted" : "rounded-md"
                    }
                    style={{
                      height: `${Math.round(share * 100)}%`,
                      ...(negative || week.amountMinor === 0
                        ? {}
                        : { backgroundColor: color, opacity: week.current ? 1 : 0.5 }),
                    }}
                  />
                </View>
                <Text
                  className={
                    week.current
                      ? "font-sans-bold text-center text-small"
                      : "text-center text-muted-foreground text-small"
                  }
                >
                  {week.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
