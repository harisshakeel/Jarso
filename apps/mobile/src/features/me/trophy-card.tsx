import { levelProgress, meCopy, type Progress } from "@jarso/core/progress";
import { FlameIcon, ZapIcon } from "lucide-react-native";
import { View } from "react-native";
import { Jarso } from "@/components/brand";
import { Card, ProgressBar } from "@/components/screen";
import { Text } from "@/components/ui";
import { useTokens } from "@/lib";

function Pill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      className="h-8 flex-row items-center gap-1 rounded-full bg-tint-gold px-2.5"
    >
      {children}
    </View>
  );
}

/** Me's top card: Jarso in the child's look, their name, level, the bar to the next level. */
export function TrophyCard({
  nickname,
  progress,
}: {
  nickname: string | null;
  progress: Progress;
}) {
  const tokens = useTokens();
  const level = levelProgress(progress.sparks);
  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-3">
        <Jarso size={96} look={progress.look} fill={0.6} />
        <View className="min-w-0 flex-1 gap-1">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="font-sans-extrabold text-h1"
          >
            {nickname ?? meCopy.you}
          </Text>
          <Text className="font-sans-bold text-h3">{meCopy.level(level.level, level.name)}</Text>
          <ProgressBar value={level.share} tone="primary" accessibilityLabel={meCopy.levelBar} />
          <Text className="text-small text-muted-foreground">
            {level.toNext === null ? meCopy.topLevel : meCopy.toNext(level.toNext, level.level + 1)}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        <Pill label={meCopy.streak(progress.streak)}>
          <FlameIcon size={16} color={tokens["gold-text"]} />
          <Text className="font-sans-bold text-small">{progress.streak}</Text>
        </Pill>
        <Pill label={meCopy.sparks(progress.sparks)}>
          <ZapIcon size={16} color={tokens["gold-text"]} />
          <Text className="font-sans-bold text-small">{progress.sparks}</Text>
        </Pill>
      </View>
      <Text className="text-muted-foreground">{meCopy.signIn(nickname)}</Text>
    </Card>
  );
}
