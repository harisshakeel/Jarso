import { KEYPAD_KEYS, type KeypadKey, pressKey } from "@jarso/core/home";
import * as Haptics from "expo-haptics";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { cn, toMajorString, useTokens } from "@/lib";
import { pictureIcon } from "./icons";

type AmountKeypadProps = {
  /** The typed text in major units ("45", "4.5"); empty until a key is pressed. */
  value: string;
  onChange: (value: string) => void;
  currency: string;
  /** Quick amounts in minor units; tapping one sets the amount. */
  chips?: number[];
  /** One chip under the amount ("Spend has ₹120"). */
  limit?: string;
  error?: string;
  testID?: string;
};

function symbol(currency: string): string {
  const part = new Intl.NumberFormat("en", { style: "currency", currency })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}

/** Whole amounts without the zeros ("20", not "20.00"); fractions lose only trailing zeros ("2.5"). */
function chipText(minor: number, currency: string): string {
  const text = toMajorString(minor, currency);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

function tick() {
  Haptics.selectionAsync().catch(() => undefined);
}

/** The big amount, a limit chip, quick chips and a 4 x 3 number pad. */
export function AmountKeypad({
  value,
  onChange,
  currency,
  chips = [],
  limit,
  error,
  testID,
}: AmountKeypadProps) {
  const tokens = useTokens();
  const Delete = pictureIcon("delete");
  const shown = value === "" ? "0" : value;
  return (
    <View className="gap-3" testID={testID}>
      <View className="items-center gap-1">
        <Text
          accessibilityLabel="Amount"
          accessibilityValue={{ text: `${symbol(currency)}${shown}` }}
          className={cn("text-money-xl", value === "" && "text-muted-foreground")}
        >
          {symbol(currency)}
          {shown}
        </Text>
        {error ? (
          <Text accessibilityLiveRegion="polite" className="text-center text-small text-primary">
            {error}
          </Text>
        ) : null}
      </View>
      {limit ? (
        <View className="items-center">
          <View className="rounded-full bg-secondary px-3 py-1.5">
            <Text className="font-sans-bold text-small text-secondary-foreground">{limit}</Text>
          </View>
        </View>
      ) : null}
      {chips.length > 0 ? (
        <View className="flex-row flex-wrap justify-center gap-2">
          {chips.map((minor) => {
            const major = chipText(minor, currency);
            const label = `${symbol(currency)}${major}`;
            return (
              <Button
                key={minor}
                variant="outline"
                size="sm"
                accessibilityLabel={label}
                onPress={() => {
                  tick();
                  onChange(major);
                }}
              >
                <Text>{label}</Text>
              </Button>
            );
          })}
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {KEYPAD_KEYS.map((key: KeypadKey) => (
          <View key={key} className="w-[31.5%] grow">
            <Button
              variant="keycap-white"
              className="h-16 w-full"
              accessibilityLabel={key === "back" ? "Delete" : key === "." ? "Point" : key}
              onPress={() => {
                tick();
                onChange(pressKey(value, key, currency));
              }}
            >
              {key === "back" ? (
                <Delete size={26} color={tokens["keycap-white-foreground"]} />
              ) : (
                <Text className="text-h2">{key}</Text>
              )}
            </Button>
          </View>
        ))}
      </View>
    </View>
  );
}
