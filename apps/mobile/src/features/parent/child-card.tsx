import {
  childCardLine,
  type DashboardChild,
  familyCardsCopy,
  goalPercent,
  weekMissions,
} from "@jarso/core/dashboard";
import { jarsoFill } from "@jarso/core/mascot";
import { useRouter } from "expo-router";
import { ChevronRightIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Text } from "@/components/ui";
import { useChildProgress } from "@/features/family";
import { cn, formatMoney, useTokens } from "@/lib";
import { useChildLearning } from "./use-child";

/** One money tile: a small label over the figure. */
function Tile({
  label,
  value,
  className,
  ink,
}: {
  label: string;
  value: string;
  className: string;
  ink?: string;
}) {
  return (
    <View className={cn("min-w-0 flex-1 gap-0.5 rounded-2xl px-3 py-2.5", className)}>
      <Text className="font-sans-semibold text-caption text-muted-foreground">{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        className={cn("font-sans-extrabold text-h2", ink)}
      >
        {value}
      </Text>
    </View>
  );
}

/** Spend, Save and the goal as three tiles: teal for Spend, gold for Save, plain for the goal. */
export function MoneyTiles({ spend, save, goal }: { spend: string; save: string; goal: string }) {
  return (
    <View className="flex-row gap-2">
      <Tile label={familyCardsCopy.spend} value={spend} className="bg-tint-teal" />
      <Tile
        label={familyCardsCopy.save}
        value={save}
        className="bg-tint-gold"
        ink="text-gold-text"
      />
      <Tile label={familyCardsCopy.goal} value={goal} className="border border-border" />
    </View>
  );
}

/** The goal tile's figure: "75%", or "No goal". */
export function goalTile(view: DashboardChild["goal"]): string {
  const percent = goalPercent(view);
  return percent === null ? familyCardsCopy.noGoal : `${percent}%`;
}

/**
 * One child on the parent's Family and Children tabs (mockup PA1): their Jarso in their own look,
 * level, streak and the week's missions in one line, then Spend, Save and the goal. The whole card
 * opens the child's page. Only this child's figures: children are never compared.
 */
export function ChildCard({
  child,
  currency,
  timezone,
}: {
  child: DashboardChild;
  currency: string;
  timezone: string;
}) {
  const router = useRouter();
  const tokens = useTokens();
  const progress = useChildProgress(child.id);
  const learning = useChildLearning(child.id, timezone);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const spend = money(child.spendMinor);
  const save = money(child.saveMinor);
  const goal = goalTile(child.goal);
  const line = childCardLine({
    level: progress.data?.level ?? null,
    streak: progress.data?.streak ?? null,
    missions: learning.data ? weekMissions(learning.data.journey) : null,
  });
  const fill = jarsoFill({
    saveMinor: child.saveMinor,
    spendMinor: child.spendMinor,
    goalTargetMinor: child.goal?.goal.targetMinor ?? null,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={familyCardsCopy.childLabel(child.nickname, line, spend, save, goal)}
      onPress={() => router.push(`/(parent)/children/${child.id}`)}
      className="gap-3 rounded-3xl border border-border bg-card p-4 active:opacity-80"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-tint-grape">
          <Jarso size={42} fill={fill} look={progress.data?.look} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-sans-bold text-h3">
            {child.nickname}
          </Text>
          {line ? (
            <Text numberOfLines={1} className="text-small text-muted-foreground">
              {line}
            </Text>
          ) : null}
        </View>
        <ChevronRightIcon size={20} color={tokens["muted-foreground"]} />
      </View>
      <MoneyTiles spend={spend} save={save} goal={goal} />
    </Pressable>
  );
}

/** Every child as a card, in the family's order. */
export function ChildCards({
  items,
  currency,
  timezone,
}: {
  items: DashboardChild[];
  currency: string;
  timezone: string;
}) {
  return (
    <View className="gap-3">
      {items.map((child) => (
        <ChildCard key={child.id} child={child} currency={currency} timezone={timezone} />
      ))}
    </View>
  );
}
