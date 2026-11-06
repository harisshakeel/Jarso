import { type HomeMoment, momentLines } from "@jarso/core/home";
import { CheckIcon, ClockIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

/**
 * One thing that happened, in two lines: a yes, pocket money due, or an ask still waiting.
 * Pocket money is not pressable: the parent hands it over and there is nothing to do.
 */
export function MomentCard({
  moment,
  money,
  parent,
  onPress,
}: {
  moment: HomeMoment;
  money: (minor: number) => string;
  parent: string;
  onPress?: () => void;
}) {
  const tokens = useTokens();
  const { title, line, chip } = momentLines(moment, money, parent);
  const kind = moment.kind;
  const tint =
    kind === "allowance-due" ? "bg-tint-gold" : kind === "said-yes" ? "bg-success-soft" : "bg-card";
  const lead: ReactNode =
    kind === "allowance-due" ? (
      <Jarso mood="wow" size={48} />
    ) : (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={cn(
          "h-11 w-11 items-center justify-center rounded-2xl",
          kind === "said-yes" ? "bg-card" : "bg-tint-gold",
        )}
      >
        {kind === "said-yes" ? (
          <CheckIcon size={22} color={tokens["success-text"]} />
        ) : (
          <ClockIcon size={22} color={tokens["gold-text"]} />
        )}
      </View>
    );
  const body = (
    <>
      {lead}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-sans-bold text-h3">
          {title}
        </Text>
        <Text numberOfLines={1} className="text-small text-muted-foreground">
          {line}
        </Text>
      </View>
      {chip ? (
        <View className="rounded-full bg-gold px-2.5 py-1">
          <Text className="font-sans-bold text-gold-foreground text-small">{chip}</Text>
        </View>
      ) : null}
    </>
  );
  const label = chip ? `${title} ${line} ${chip}` : `${title} ${line}`;
  const style = cn("flex-row items-center gap-3 rounded-xl border border-border px-4 py-3", tint);
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} className={style}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={style}
    >
      {body}
    </Pressable>
  );
}
