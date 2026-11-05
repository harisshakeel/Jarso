import { profileCopy } from "@jarso/core/profiles";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Switch, Text } from "@/components/ui";
import { cn } from "@/lib";
import { useDarkMode } from "./theme";

/**
 * "Dark mode": one switch for the parent's Settings and the child's Me, as a row inside a card.
 * The whole 48 dp row is the switch; the drawn Switch is hidden from screen readers.
 */
export function DarkModeRow({
  leading,
  detail = true,
  labelClassName,
}: {
  leading?: ReactNode;
  /** The muted "Switch between light and dark" line (the child's Me drops it, mockup). */
  detail?: boolean;
  labelClassName?: string;
}) {
  const [dark, setDark] = useDarkMode();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={profileCopy.darkMode}
      accessibilityState={{ checked: dark }}
      onPress={() => setDark(!dark)}
      className="min-h-12 flex-row items-center gap-3 py-1 active:opacity-70"
    >
      {leading}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className={cn("font-sans-semibold", labelClassName)}>{profileCopy.darkMode}</Text>
        {detail ? (
          <Text className="text-small text-muted-foreground">{profileCopy.darkModeBody}</Text>
        ) : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={dark} onValueChange={setDark} />
      </View>
    </Pressable>
  );
}
