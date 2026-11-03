import { Tabs } from "expo-router/js-tabs";
import {
  GraduationCapIcon,
  HomeIcon,
  InboxIcon,
  type LucideIcon,
  NotebookPenIcon,
  SparklesIcon,
} from "lucide-react-native";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuideState } from "@/features/guide";
import { useUnreadCount } from "@/features/news";

// The web's child nav (design.md §5): Home · Diary · Learn · Jarso · News, same icons; the
// active one is filled softly. Requests and Me are stack screens (from Home).
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

/** The child's five tabs. The role guard is in the parent `(child)/_layout`. */
export default function TabsLayout() {
  // Nunito's descenders (y, g, q) clip in the default bar; give the label a line height and the
  // bar room for it above the system navigation area.
  const { bottom } = useSafeAreaInsets();
  // The Jarso tab shows only once the server says the guide is on for this child.
  const guide = useGuideState();
  const guideOn = guide.data?.available === true;
  // The News badge: unread notices, kept live by the NoticeListener. Nothing shows for 0.
  const unread = useUnreadCount().data;
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
      <Tabs.Screen name="diary" options={{ title: "Diary", tabBarIcon: icon(NotebookPenIcon) }} />
      <Tabs.Screen name="learn" options={{ title: "Learn", tabBarIcon: icon(GraduationCapIcon) }} />
      <Tabs.Screen
        name="jarso"
        options={{
          title: "Jarso",
          tabBarIcon: icon(SparklesIcon),
          href: guideOn ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: "News",
          tabBarIcon: icon(InboxIcon),
          tabBarBadge: unread ? unread : undefined,
        }}
      />
    </Tabs>
  );
}
