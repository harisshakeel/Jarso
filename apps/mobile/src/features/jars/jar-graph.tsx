import type { Jars } from "@jarso/core/ledger";
import {
  type BalanceHistory,
  balanceHistory,
  type GraphPeriod,
  graphCaption,
  graphCopy,
  graphPeriods,
  lastDays,
  niceTop,
  smoothPath,
} from "@jarso/core/ledger";
import type { FamilyContext } from "@jarso/data/family";
import { listMovementsSince, localDate } from "@jarso/data/ledger";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { addDays, cn, formatMoney, useTokens } from "@/lib";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** Days the graph can look back; the longest period it offers. */
const GRAPH_DAYS = 90;

// The web's drawing box (jar-graph.tsx).
const W = 360;
const H = 210;
const PAD = { top: 40, right: 16, bottom: 30, left: 46 };
const PLOT = { x: PAD.left, y: PAD.top, w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };
const GROUND = PLOT.y + PLOT.h + 3;

/**
 * Where both jars stood at the end of each of the last 90 days, ending at Home's balances: one
 * read of the movements, then core's walk-back (the web's `getBalanceHistory`).
 */
export function useBalanceHistory(jars: Jars, context: FamilyContext) {
  const { userId } = useSession();
  const movements = useQuery({
    queryKey: keys.balance(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => {
      const from = addDays(context.today, -(GRAPH_DAYS - 1));
      // A day earlier than `from` in UTC covers every timezone's start of that day.
      return listMovementsSince(supabase, userId as string, `${addDays(from, -1)}T00:00:00Z`);
    },
  });
  const data = useMemo<BalanceHistory | undefined>(() => {
    if (!movements.data) return undefined;
    const from = addDays(context.today, -(GRAPH_DAYS - 1));
    const rows = movements.data.map((row) => ({
      jar: row.jar,
      direction: row.direction,
      amountMinor: row.amountMinor,
      occurredOn: localDate(row.occurredAt, context.timezone),
    }));
    return balanceHistory(jars, rows, from, context.today);
  }, [movements.data, jars, context]);
  return { data, error: movements.error };
}

/** "Fri 30 Oct" for an ISO date; a calendar day, so formatted in UTC. */
function showDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * "Your money ride" (child Home): Spend and Save as two tracks over this week, this month or 3
 * months, ending at today's balances, a coin on each day money moved. Core's caption says what
 * climbed and what dipped; "See the numbers" lists the figures. Nice to have: hidden if it can't load.
 */
export function JarGraph({ jars, context }: { jars: Jars; context: FamilyContext }) {
  const tokens = useTokens();
  const history = useBalanceHistory(jars, context);
  const { currency } = context;
  const [days, setDays] = useState<GraphPeriod>(7);
  const [numbers, setNumbers] = useState(false);
  if (!history.data) return null;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const period = graphPeriods.find((p) => p.days === days) ?? graphPeriods[0];
  const view = lastDays(history.data, days);
  const { points } = view;
  const moved = new Set(view.movedOn);
  const top = niceTop(Math.max(100, ...points.flatMap((p) => [p.spend, p.save])));
  const x = (index: number) =>
    PLOT.x + (points.length < 2 ? PLOT.w / 2 : (index / (points.length - 1)) * PLOT.w);
  const y = (minor: number) => PLOT.y + PLOT.h - (Math.max(0, minor) / top) * PLOT.h;
  const series = [
    { key: "spend" as const, name: graphCopy.spend, color: tokens.primary },
    { key: "save" as const, name: graphCopy.save, color: tokens.gold },
  ];
  const tickEvery = Math.max(1, Math.ceil(points.length / 4));
  const last = points.length - 1;

  return (
    <View
      accessibilityLabel={graphCopy.title}
      className="gap-3 rounded-xl border border-border bg-card p-4"
    >
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {graphCopy.title}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={graphCopy.show}
        className="flex-row gap-1 self-start rounded-full bg-muted p-1"
      >
        {graphPeriods.map((option) => {
          const checked = days === option.days;
          return (
            <Pressable
              key={option.days}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked }}
              onPress={() => setDays(option.days)}
              className={cn("min-h-11 justify-center rounded-full px-3", checked && "bg-card")}
            >
              <Text
                className={cn("font-sans-bold text-small", !checked && "text-muted-foreground")}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row gap-4">
        {series.map((s) => (
          <View key={s.key} className="flex-row items-center gap-2">
            <View className="h-1.5 w-5 rounded-full" style={{ backgroundColor: s.color }} />
            <Text className="font-sans-bold text-small">{s.name}</Text>
          </View>
        ))}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="w-full"
        style={{ aspectRatio: W / H }}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          {[top, 0].map((value) => (
            <SvgText
              key={value}
              x={PLOT.x - 8}
              y={y(value) + 4}
              textAnchor="end"
              fontSize={11}
              fontWeight="700"
              fill={tokens["muted-foreground"]}
            >
              {money(value)}
            </SvgText>
          ))}
          <Line
            x1={PLOT.x - 6}
            x2={PLOT.x + PLOT.w + 6}
            y1={GROUND}
            y2={GROUND}
            strokeWidth={2}
            strokeLinecap="round"
            stroke={tokens["hairline-strong"]}
          />
          {points.map((p, index) =>
            (last - index) % tickEvery === 0 ? (
              <SvgText
                key={p.date}
                x={x(index)}
                y={H - 4}
                textAnchor={index === 0 ? "start" : index === last ? "end" : "middle"}
                fontSize={10}
                fontWeight="600"
                fill={tokens["muted-foreground"]}
              >
                {showDate(p.date).slice(4)}
              </SvgText>
            ) : null,
          )}
          {series.map((s) => (
            <Path
              key={s.key}
              d={smoothPath(
                points.map((_, index) => x(index)),
                points.map((p) => y(p[s.key])),
              )}
              fill="none"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              stroke={s.color}
            />
          ))}
          {points.map((p, index) =>
            moved.has(p.date)
              ? series.map((s) => (
                  <Circle
                    key={`${s.key}-${p.date}`}
                    cx={x(index)}
                    cy={y(p[s.key])}
                    r={5}
                    strokeWidth={1.5}
                    fill={tokens.gold}
                    stroke={tokens["keycap-ledge"]}
                  />
                ))
              : null,
          )}
        </Svg>
      </View>
      <Text className="font-sans-bold">
        {graphCaption(points, view.movedOn.length > 0, money, period.word)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={graphCopy.seeNumbers}
        accessibilityState={{ expanded: numbers }}
        onPress={() => setNumbers((open) => !open)}
        className="min-h-11 justify-center self-start"
      >
        <Text className="font-sans-bold text-muted-foreground text-small">
          {graphCopy.seeNumbers}
        </Text>
      </Pressable>
      {numbers ? (
        <View className="gap-1">
          {points
            .filter((p, index) => moved.has(p.date) || index === last)
            .map((p) => (
              <Text key={p.date}>
                {`${showDate(p.date)} · ${graphCopy.spend} ${money(p.spend)} · ${graphCopy.save} ${money(p.save)}`}
              </Text>
            ))}
        </View>
      ) : null}
    </View>
  );
}
