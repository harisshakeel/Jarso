import { palette } from "@jarso/brand/tokens";
import { questCopy } from "@jarso/core/learning";
import { progressCopy } from "@jarso/core/progress";
import { useRouter } from "expo-router";
import { FlameIcon } from "lucide-react-native";
import { useRef } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Jarso } from "@/components/brand";
import { Button, Text } from "@/components/ui";
import { useDailyCheckin, useProgress } from "@/features/progress";
import { logger } from "@/lib";

/**
 * The daily check-in: one tap, "Spend anything today?". Both answers are written without
 * waiting, and a failed write is only logged: the child is never blocked.
 */
export function CheckinScreen() {
  const router = useRouter();
  const progress = useProgress();
  const checkin = useDailyCheckin();
  const done = useRef(false);

  const answer = (value: "yes" | "nope") => {
    if (done.current) return;
    done.current = true;
    checkin.mutateAsync(value).catch(() => logger.warn("Could not save the daily check-in"));
    if (value === "yes") router.replace("/(child)/purchase");
    else router.back();
  };

  const stats = progress.data;
  return (
    <SafeAreaView className="flex-1 bg-primary">
      <View className="flex-1 items-center gap-4 px-6 pt-4 pb-6">
        <Text className="font-sans-bold text-caption text-teal-100">
          {questCopy.checkin.eyebrow}
        </Text>
        <Jarso mood="happy" size={150} look={stats?.look} />
        <Text
          accessibilityRole="header"
          className="text-center font-sans-extrabold text-h1 text-white"
        >
          {progressCopy.checkinQuestion}
        </Text>
        <View className="w-full flex-row gap-3">
          <Button
            variant="keycap-white"
            size="xl"
            className="flex-1"
            onPress={() => answer("nope")}
          >
            <Text>{progressCopy.nope}</Text>
          </Button>
          <Button variant="keycap-gold" size="xl" className="flex-1" onPress={() => answer("yes")}>
            <Text>{progressCopy.yes}</Text>
          </Button>
        </View>
        <View className="flex-1" />
        {stats ? (
          <View className="w-full items-center gap-2 rounded-2xl bg-white/10 p-4">
            <View className="flex-row items-center gap-2">
              <FlameIcon size={20} color={palette.blush} />
              <Text className="font-sans-bold text-white">
                {progressCopy.streakDays(stats.streak)}
              </Text>
            </View>
            <Text className="text-caption text-white">{progressCopy.restDay}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
