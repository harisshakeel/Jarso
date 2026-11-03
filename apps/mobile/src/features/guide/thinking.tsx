import { guideCopy } from "@jarso/core/guide";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/ui";
import { useTokens } from "@/lib";
import { AiChip } from "./intro";

/** With no new line for this long, the bubble starts saying it is still at it. */
const QUIET_MS = 5_000;
/** How often the still-working line changes after that. */
const ROTATE_MS = 3_000;

/**
 * Jarso's bubble while the reply is on its way: the AI chip, a spinner and the latest status
 * line from the server. A long think with no new line turns over "Still thinking…", "Counting
 * carefully…", "Nearly there…", as on the web. Only fixed copy, never model text.
 */
export function ThinkingBubble({ status }: { status: string | null }) {
  const tokens = useTokens();
  const [still, setStill] = useState<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new status line restarts the timer
  useEffect(() => {
    setStill(null);
    const quiet = setTimeout(() => setStill(0), QUIET_MS);
    return () => clearTimeout(quiet);
  }, [status]);
  useEffect(() => {
    if (still === null) return;
    const next = setTimeout(
      () => setStill((n) => ((n ?? 0) + 1) % guideCopy.stillWorking.length),
      ROTATE_MS,
    );
    return () => clearTimeout(next);
  }, [still]);

  const line = still === null ? (status ?? guideCopy.thinking) : guideCopy.stillWorking[still];
  return (
    <View
      accessibilityLiveRegion="polite"
      className="mr-8 gap-2 self-start rounded-2xl rounded-bl-sm bg-card p-4"
    >
      <AiChip />
      <View className="flex-row items-center gap-3">
        <ActivityIndicator size="small" color={tokens.primary} />
        <Text className="text-muted-foreground">{line}</Text>
      </View>
    </View>
  );
}
