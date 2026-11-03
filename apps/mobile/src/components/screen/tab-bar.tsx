import { mobileFontSize } from "@jarso/brand/tokens";
import type { LucideIcon } from "lucide-react-native";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
    tabBarStyle: { height: 68 + bottom, paddingTop: 8, paddingBottom: bottom + 8 },
    tabBarIconStyle: { marginBottom: 2 },
    tabBarLabelStyle: {
      fontFamily: "Nunito_600SemiBold",
      fontSize: mobileFontSize.caption.size,
      lineHeight: mobileFontSize.caption.lineHeight,
    },
  };
}
