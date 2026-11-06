import { lookCopy } from "@jarso/core/mascot";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "@/components/screen";
import { Text } from "@/components/ui";
import { LookPicker, useProgress, useSetJarsoLook } from "@/features/progress";
import { useNickname } from "@/features/settings";
import { BadgeShelf } from "./badge-shelf";
import { MeSettings } from "./me-settings";
import { TrophyCard } from "./trophy-card";

/**
 * The child's Me (opens from Home's avatar): the trophy room. Jarso, level and Sparks, the badge
 * shelf, Jarso's look, then settings and Sign out. Progress that can't load hides the top three;
 * settings always work.
 */
export function MeScreen() {
  const { data: nickname } = useNickname();
  const { data: progress } = useProgress();
  const setLook = useSetJarsoLook();
  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow gap-5 px-4 pt-4 pb-6">
        {progress ? (
          <>
            <TrophyCard nickname={nickname ?? null} progress={progress} />
            <BadgeShelf badges={progress.badges} />
            <Card className="gap-3">
              <Text accessibilityRole="header" className="font-sans-bold text-h3">
                {lookCopy.title}
              </Text>
              <LookPicker
                level={progress.level}
                value={progress.look}
                onChange={(look) => setLook.mutate(look)}
              />
            </Card>
          </>
        ) : null}
        <MeSettings />
      </ScrollView>
    </SafeAreaView>
  );
}
