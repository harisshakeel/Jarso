import { pushOffCardCopy as copy } from "@jarso/core/notifications";
import { ActivityIndicator, View } from "react-native";
import { Card } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { usePushPermission } from "./use-push-permission";

/**
 * On the home screen while Jarso's notifications are off on this phone: "Turn on" shows our line
 * and Android's prompt; once Android won't ask again, "Open phone settings" goes there instead.
 * Gone once they're on, or after "Not now".
 */
export function PushPermissionCard() {
  const { state, busy, role, turnOn, openSettings, dismiss } = usePushPermission();
  if (state === "hidden" || !role) return null;
  const blocked = state === "blocked";
  const action = blocked ? copy.openSettings : copy.turnOn;

  return (
    <Card>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {copy.title}
      </Text>
      <Text className="text-muted-foreground">{blocked ? copy.blocked : copy[role]}</Text>
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          accessibilityLabel={action}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => void (blocked ? openSettings() : turnOn())}
        >
          {busy ? <ActivityIndicator color="white" /> : <Text>{action}</Text>}
        </Button>
        <Button
          variant="ghost"
          accessibilityLabel={copy.later}
          disabled={busy}
          onPress={() => void dismiss()}
        >
          <Text>{copy.later}</Text>
        </Button>
      </View>
    </Card>
  );
}
