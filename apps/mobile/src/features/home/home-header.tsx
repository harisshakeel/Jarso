import { homeCopy } from "@jarso/core/home";
import type { JarsoLook } from "@jarso/core/mascot";
import { useRouter } from "expo-router";
import { BellIcon, FlameIcon, ZapIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Text } from "@/components/ui";
import { useTokens } from "@/lib";

function Chip({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      className="h-9 flex-row items-center gap-1 rounded-full bg-tint-gold px-2.5"
    >
      {children}
      <Text className="font-sans-bold text-small">{count}</Text>
    </View>
  );
}

/** Home's top row: the avatar (opens Me), the greeting, streak, Sparks and the bell. */
export function HomeHeader({
  nickname,
  look,
  streak,
  sparks,
  unread,
}: {
  nickname: string | null;
  look: JarsoLook | undefined;
  streak: number;
  sparks: number | null;
  unread: number;
}) {
  const router = useRouter();
  const tokens = useTokens();
  return (
    <View className="flex-row items-center justify-between gap-2">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={homeCopy.me}
          hitSlop={4}
          onPress={() => router.push("/(child)/me")}
          className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-tint-grape"
        >
          <Jarso size={34} look={look} />
        </Pressable>
        <Text
          numberOfLines={1}
          accessibilityRole="header"
          className="shrink font-sans-bold text-h2"
        >
          {homeCopy.greeting(nickname)}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {streak > 0 ? (
          <Chip label={homeCopy.streak(streak)} count={streak}>
            <FlameIcon size={16} color={tokens["gold-text"]} />
          </Chip>
        ) : null}
        {sparks !== null ? (
          <Chip label={homeCopy.sparks(sparks)} count={sparks}>
            <ZapIcon size={16} color={tokens["gold-text"]} />
          </Chip>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `${homeCopy.bell}, ${unread} new` : homeCopy.bell}
          hitSlop={6}
          onPress={() => router.push("/(child)/news")}
          className="h-9 w-9 items-center justify-center rounded-full bg-secondary"
        >
          <BellIcon size={18} color={tokens["secondary-foreground"]} />
          {unread > 0 ? (
            <View className="absolute top-1 right-1.5 h-2.5 w-2.5 rounded-full bg-gold" />
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
