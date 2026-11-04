import { offlineCopy } from "@jarso/core/offline";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { AppError, actionErrorMessage } from "@/lib";
import { useSession } from "./use-session";

/**
 * Shown while the role can't be checked (offline, timeout). The session is kept; a child who is
 * stuck can still sign out. Says whether the phone is offline or Jarso is slow. `onRetry` replaces
 * the session re-check when a screen's own read failed (the parent's setup gate).
 */
export function UnavailableNotice({ onRetry }: { onRetry?: () => void } = {}) {
  const { retry, signOut } = useSession();
  const [message, setMessage] = useState<string>(offlineCopy.offline);

  const refreshMessage = useCallback(() => {
    void actionErrorMessage(new AppError("UNAVAILABLE", offlineCopy.offline)).then(setMessage);
  }, []);
  useEffect(refreshMessage, [refreshMessage]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-6 px-6">
        <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
          {message}
        </Text>
        <Button
          size="lg"
          accessibilityLabel="Try again"
          onPress={() => {
            refreshMessage();
            (onRetry ?? retry)();
          }}
        >
          <Text>Try again</Text>
        </Button>
        <Button
          variant="link"
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => void signOut()}
        >
          <Text>Sign out</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
