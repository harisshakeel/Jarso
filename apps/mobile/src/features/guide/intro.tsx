import { guideCopy, guideUi } from "@jarso/core/guide";
import { BotIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { useTokens } from "@/lib";

/** "Jarso AI": on every reply, so the child always knows it's a computer program. */
export function AiChip() {
  const tokens = useTokens();
  return (
    <View className="flex-row items-center gap-1 self-start rounded-full bg-cyan-100 px-2 py-0.5">
      <BotIcon size={14} color={tokens["ai-text"]} />
      <Text className="font-sans-semibold text-cyan-700 text-caption">{guideCopy.label}</Text>
    </View>
  );
}

/** Before a child's first chat: what Jarso is, what it can see, and what not to share. */
export function GuideIntro({ onDone }: { onDone: () => void }) {
  const tokens = useTokens();
  return (
    <View className="gap-3 rounded-2xl bg-secondary p-5">
      <View className="flex-row items-center gap-2">
        <BotIcon size={20} color={tokens["secondary-foreground"]} />
        <Text accessibilityRole="header" className="font-sans-bold text-secondary-foreground">
          {guideUi.beforeWeStart}
        </Text>
      </View>
      {guideCopy.intro.map((line) => (
        <Text key={line} className="text-secondary-foreground">
          {line}
        </Text>
      ))}
      <Button
        size="lg"
        accessibilityLabel={guideCopy.introButton}
        className="self-start"
        onPress={onDone}
      >
        <Text>{guideCopy.introButton}</Text>
      </Button>
    </View>
  );
}
