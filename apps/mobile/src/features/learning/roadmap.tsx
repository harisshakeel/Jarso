import { type JourneyMission, roadmapCopy } from "@jarso/core/learning";
import { useRouter } from "expo-router";
import { CheckIcon, LockIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

/**
 * The seven-day journey (FR12), phone-native: one stop per row from Day 1 down, joined by the
 * road. Done stops are teal, the current one is gold, the rest are locked. Done and current stops
 * open their mission; a locked stop is read out as locked.
 */
export function Roadmap({ journey }: { journey: JourneyMission[] }) {
  const router = useRouter();
  const tokens = useTokens();
  const currentIndex = journey.findIndex((mission) => mission.status === "current");
  const anyLocked = journey.some((mission) => mission.status === "locked");
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {roadmapCopy.heading}
      </Text>
      <View accessibilityLabel={roadmapCopy.heading} className="gap-0">
        {journey.map((mission, index) => {
          const done = mission.status === "done";
          const current = mission.status === "current";
          const name = roadmapCopy.stopName(mission.day, mission.title);
          const last = index === journey.length - 1;
          const dot = (
            <View
              className={cn(
                "size-14 items-center justify-center rounded-full border-4",
                done && "border-primary bg-primary",
                current && "border-gold bg-gold-100",
                !done && !current && "border-hairline-strong bg-card",
              )}
            >
              {done ? (
                <CheckIcon size={26} color={tokens["primary-foreground"]} />
              ) : current ? (
                <Text className="font-sans-extrabold text-gold-700 text-h3">{mission.day}</Text>
              ) : (
                <LockIcon size={20} color={tokens["muted-foreground"]} />
              )}
            </View>
          );
          const label = (
            <View className="flex-1">
              <Text className="text-muted-foreground text-small">
                {roadmapCopy.day(mission.day)}
              </Text>
              <Text
                className={cn("font-sans-semibold", !done && !current && "text-muted-foreground")}
              >
                {mission.title}
              </Text>
            </View>
          );
          return (
            <View key={mission.key} className="flex-row gap-4">
              <View className="items-center">
                {done || current ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    accessibilityState={{ selected: current }}
                    onPress={() =>
                      router.push({
                        pathname: "/(child)/learn/[missionKey]",
                        params: { missionKey: mission.key },
                      })
                    }
                  >
                    {dot}
                  </Pressable>
                ) : (
                  <View accessible accessibilityLabel={roadmapCopy.locked(name)}>
                    {dot}
                  </View>
                )}
                {last ? null : (
                  <View className={cn("h-6 w-2 rounded-full", done ? "bg-teal-100" : "bg-muted")} />
                )}
              </View>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="flex-1 pt-2"
              >
                {label}
              </View>
            </View>
          );
        })}
      </View>
      <Text className="text-center text-muted-foreground">
        {currentIndex >= 0
          ? `${roadmapCopy.tapGold(journey[currentIndex]?.day)}${anyLocked ? roadmapCopy.unlocksAfter : ""}`
          : roadmapCopy.journeyDone}
      </Text>
    </View>
  );
}
