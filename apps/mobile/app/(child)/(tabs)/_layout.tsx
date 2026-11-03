import { Tabs } from "expo-router/js-tabs";
import {
  HandCoinsIcon,
  HomeIcon,
  type LucideIcon,
  NotebookPenIcon,
  SettingsIcon,
} from "lucide-react-native";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Same icons as the web's child nav (Home, Diary → History); the active one is filled softly.
const icon =
  (Icon: LucideIcon) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon
      size={24}
      color={color}
      fill={focused ? color : "none"}
      fillOpacity={focused ? 0.18 : 0}
    />
  );

/** The child's four tabs. The role guard is in the parent `(child)/_layout`. */
export default function TabsLayout() {
  // Nunito's descenders (y, g, q) clip in the default bar; give the label a line height and the
  // bar room for it above the system navigation area.
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { height: 68 + bottom, paddingTop: 8, paddingBottom: bottom + 8 },
        tabBarIconStyle: { marginBottom: 2 },
        tabBarLabelStyle: { fontFamily: "Nunito_600SemiBold", fontSize: 12, lineHeight: 16 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon(HomeIcon) }} />
      <Tabs.Screen
        name="history"
        options={{ title: "History", tabBarIcon: icon(NotebookPenIcon) }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: "Requests", tabBarIcon: icon(HandCoinsIcon) }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: icon(SettingsIcon) }}
      />
    </Tabs>
  );
}
