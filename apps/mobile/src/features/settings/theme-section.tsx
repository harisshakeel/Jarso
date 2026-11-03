import { profileCopy } from "@jarso/core/profiles";
import { Pressable, View } from "react-native";
import { Card } from "@/components/screen";
import { Text } from "@/components/ui";
import { cn } from "@/lib/utils";
import { type ThemeChoice, useThemeChoice } from "./theme";

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Same as my phone" },
];

/** "Looks": light, dark or the phone's own, kept on this device. Shared by the child and parent. */
export function ThemeSection() {
  const [theme, setTheme] = useThemeChoice();
  return (
    <Card>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {profileCopy.looksTitle}
      </Text>
      <Text className="text-muted-foreground">{profileCopy.looksBody}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={profileCopy.looksTitle}
        className="gap-2"
      >
        {CHOICES.map(({ value, label }) => {
          const checked = theme === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked }}
              onPress={() => setTheme(value)}
              className={cn(
                "h-12 justify-center rounded-full border px-5",
                checked ? "border-transparent bg-primary" : "border-border bg-background",
              )}
            >
              <Text className={cn("font-sans-bold", checked && "text-primary-foreground")}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
