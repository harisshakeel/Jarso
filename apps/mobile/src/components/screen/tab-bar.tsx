import { mobileFontSize } from "@jarso/brand/tokens";
import { type LucideIcon, PlusIcon } from "lucide-react-native";
import { type ColorValue, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTokens } from "@/lib";

/** A tab's icon (design.md §5): the active one is filled softly. */
export const tabIcon =
  (Icon: LucideIcon) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon
      size={24}
      color={color}
      fill={focused ? color : "none"}
      fillOpacity={focused ? 0.18 : 0}
    />
  );

/**
 * The tab bar's look, shared by the child's and the parent's tabs. Nunito's descenders (y, g, q)
 * clip in the default bar; the label gets a line height and the bar room for it above the system
 * navigation area.
 */
export function useTabBarOptions() {
  const { bottom } = useSafeAreaInsets();
  return {
    tabBarStyle: {
      height: 68 + bottom,
      paddingTop: 8,
      paddingBottom: bottom + 8,
      overflow: "visible" as const,
    },
    tabBarIconStyle: { marginBottom: 2 },
    tabBarLabelStyle: {
      fontFamily: "Nunito_600SemiBold",
      fontSize: mobileFontSize.caption.size,
      lineHeight: mobileFontSize.caption.lineHeight,
    },
  };
}

/**
 * The child's + (the one way to record money): a gold keycap raised above the bar. It opens the
 * "What happened?" sheet and never selects a tab.
 */
export function PlusTabButton({ onPress }: { onPress: () => void }) {
  const tokens = useTokens();
  return (
    <View className="flex-1 items-center" style={{ overflow: "visible" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="What happened?"
        onPress={onPress}
        style={{ marginTop: -18 }}
        className="size-16 items-center justify-center rounded-full border-b-[5px] border-keycap-ledge-gold bg-gold active:translate-y-[5px] active:border-b-0"
      >
        <PlusIcon size={32} strokeWidth={3} color={tokens["gold-foreground"]} />
      </Pressable>
    </View>
  );
}
