import { ActivityIndicator, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { toUserMessage } from "@/lib";

/** A parent screen before its first read: the spinner, or the read's error with Try again. */
export function ScreenState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (!error) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  return (
    <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
      <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
        {toUserMessage(error)}
      </Text>
      <Button size="lg" accessibilityLabel="Try again" onPress={onRetry}>
        <Text>Try again</Text>
      </Button>
    </View>
  );
}
