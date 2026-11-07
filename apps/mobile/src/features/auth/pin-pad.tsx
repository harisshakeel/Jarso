import { childScanCopy } from "@jarso/core/family";
import * as Haptics from "expo-haptics";
import { DeleteIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

/** PINs are 4 to 6 numbers (`childSignInSchema`). */
export const PIN_MAX = 6;
const PIN_SLOTS = 4;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

function tick() {
  Haptics.selectionAsync().catch(() => undefined);
}

/**
 * The child's PIN on big keys instead of the keyboard: a dot per number typed (never the digit),
 * up to six, and Delete. Each key has a test id (`pin-key-<n>`) for the device flows.
 */
export function PinPad({
  value,
  onChange,
  errors,
}: {
  value: string;
  onChange: (pin: string) => void;
  errors?: string[];
}) {
  const tokens = useTokens();
  const slots = Math.max(PIN_SLOTS, value.length);
  const error = errors?.[0];

  const press = (key: (typeof KEYS)[number]) => {
    tick();
    if (key === "back") onChange(value.slice(0, -1));
    else if (value.length < PIN_MAX) onChange(value + key);
  };

  return (
    <View className="gap-3">
      <Text nativeID="pin-label" className="font-sans-semibold">
        {childScanCopy.pin}
      </Text>
      <View
        accessible
        accessibilityLabel={childScanCopy.pin}
        accessibilityValue={{ text: childScanCopy.pinTyped(value.length) }}
        className="flex-row justify-center gap-3"
      >
        {Array.from({ length: slots }, (_, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots, never reordered
            key={i}
            className={cn(
              "h-5 w-5 rounded-full border-2",
              i < value.length ? "border-primary bg-primary" : "border-input",
              error && "border-destructive",
            )}
          />
        ))}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-center text-destructive">
          {error}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {KEYS.map((key) =>
          key === "" ? (
            <View key="blank" className="w-[31.5%] grow" />
          ) : (
            <View key={key} className="w-[31.5%] grow">
              <Button
                variant="keycap-white"
                className="h-16 w-full"
                testID={key === "back" ? "pin-key-delete" : `pin-key-${key}`}
                accessibilityLabel={key === "back" ? childScanCopy.delete : key}
                onPress={() => press(key)}
              >
                {key === "back" ? (
                  <DeleteIcon size={26} color={tokens["keycap-white-foreground"]} />
                ) : (
                  <Text className="text-h2">{key}</Text>
                )}
              </Button>
            </View>
          ),
        )}
      </View>
    </View>
  );
}
