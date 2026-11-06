import {
  BADGE_KEYS,
  BADGES,
  type BadgeKey,
  badgeShelf,
  meCopy,
  type Progress,
} from "@jarso/core/progress";
import { LockIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";
import { BADGE_ICONS } from "./badge-icons";

/** Every badge as a tile: earned ones lit, the rest locked. Tap one to read how it is earned. */
export function BadgeShelf({ badges }: { badges: Progress["badges"] }) {
  const tokens = useTokens();
  const [open, setOpen] = useState<BadgeKey | null>(null);
  const shelf = badgeShelf(badges);
  const earned = shelf.filter((b) => b.earned).length;
  const picked = open ? BADGES[open] : null;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {meCopy.badgesHeading}
        </Text>
        <Text className="text-small text-muted-foreground">
          {meCopy.badgeCount(earned, BADGE_KEYS.length)}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {shelf.map(({ key, earned: got }) => {
          const Icon = got ? BADGE_ICONS[key] : LockIcon;
          const name = BADGES[key].name;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={got ? meCopy.badgeEarned(name) : meCopy.badgeLocked(name)}
              accessibilityState={{ selected: open === key }}
              onPress={() => setOpen(open === key ? null : key)}
              className={cn(
                "size-14 items-center justify-center rounded-2xl border-2",
                got ? "border-gold bg-tint-gold" : "border-transparent bg-muted",
                open === key && "border-primary",
              )}
            >
              <Icon size={24} color={got ? tokens["gold-text"] : tokens["muted-foreground"]} />
            </Pressable>
          );
        })}
      </View>
      {picked ? (
        <Text accessibilityLiveRegion="polite" className="text-muted-foreground">
          <Text className="font-sans-bold">{picked.name}</Text>
          {` · ${picked.how}`}
        </Text>
      ) : null}
    </View>
  );
}
