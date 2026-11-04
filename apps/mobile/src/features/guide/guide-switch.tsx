import { parentGuideCopy } from "@jarso/core/guide";
import { useState } from "react";
import { Linking, Switch, View } from "react-native";
import { Text } from "@/components/ui";
import { WEB_URL } from "@/config";
import { actionErrorMessage, logger } from "@/lib";
import { useSetGuideAccess } from "./use-parent-guide";

const SAFETY_URL = `${WEB_URL}/safety`;

/**
 * The parent's per-child switch for Jarso (the web's GuideSwitch, ADR 0011). It flips at once and
 * flips back with the error if the save fails. `detail`: "full" adds the whole explanation and the
 * safety page (the chats page); "none" is the switch alone (a row in settings).
 */
export function GuideSwitch({
  childId,
  nickname,
  enabled,
  detail = "full",
}: {
  childId: string;
  nickname: string;
  enabled: boolean;
  detail?: "full" | "none";
}) {
  const save = useSetGuideAccess();
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string>();
  const label = parentGuideCopy.switchLabel(nickname);

  async function change(next: boolean) {
    setError(undefined);
    setOn(next);
    try {
      await save.mutateAsync({ childId, enabled: next });
    } catch (cause) {
      setOn(!next);
      setError(await actionErrorMessage(cause));
    }
  }

  const openSafety = () =>
    Linking.openURL(SAFETY_URL).catch(() => {
      logger.warn("Could not open the safety page");
    });

  return (
    <View className="gap-2">
      <View className="min-h-12 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 font-sans-semibold">{label}</Text>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={label}
          value={on}
          disabled={save.isPending}
          onValueChange={(next) => void change(next)}
        />
      </View>
      {detail === "full" ? (
        <Text className="text-muted-foreground">
          {`${parentGuideCopy.fullBody(nickname)} `}
          <Text
            accessibilityRole="link"
            onPress={() => void openSafety()}
            className="font-sans-semibold text-primary underline"
          >
            {parentGuideCopy.fullLink}
          </Text>
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
