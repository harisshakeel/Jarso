import { playerCopy } from "@jarso/core/learning";
import type { ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { toUserMessage } from "@/lib";

/** A Learn page under the native header: scrolls, keeps taps while the keyboard is up. */
export function LearnPage({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-10"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Loading, or the read's safe error with a way to try again. */
export function PageWait({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      {error ? (
        <>
          <Text accessibilityRole="alert" className="text-center">
            {toUserMessage(error)}
          </Text>
          {onRetry ? (
            <Button variant="outline" accessibilityLabel={playerCopy.tryAgain} onPress={onRetry}>
              <Text>{playerCopy.tryAgain}</Text>
            </Button>
          ) : null}
        </>
      ) : (
        <ActivityIndicator accessibilityLabel="Loading" />
      )}
    </View>
  );
}

/** A finished or empty state: a heading, a line and one way back. */
export function EndCard({
  heading,
  body,
  action,
  onPress,
}: {
  heading: string;
  body: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View className="gap-4 rounded-2xl bg-card p-5">
      <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
        {heading}
      </Text>
      <Text className="text-muted-foreground">{body}</Text>
      <Button size="lg" accessibilityLabel={action} onPress={onPress}>
        <Text>{action}</Text>
      </Button>
    </View>
  );
}

/** The small grey label over a page's heading. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <Text className="font-sans-bold text-muted-foreground text-caption uppercase">{children}</Text>
  );
}
