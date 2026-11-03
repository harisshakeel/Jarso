import { Tabs } from "expo-router/js-tabs";
import {
  GraduationCapIcon,
  HomeIcon,
  InboxIcon,
  NotebookPenIcon,
  SparklesIcon,
} from "lucide-react-native";
import { tabIcon as icon, useTabBarOptions } from "@/components/screen";
import { useGuideState } from "@/features/guide";
import { useUnreadCount } from "@/features/news";

// The web's child nav (design.md §5): Home · Diary · Learn · Jarso · News, same icons. Requests
// and Me are stack screens (from Home).

/** The child's five tabs. The role guard is in the parent `(child)/_layout`. */
export default function TabsLayout() {
  const tabBar = useTabBarOptions();
  // The Jarso tab shows only once the server says the guide is on for this child.
  const guide = useGuideState();
  const guideOn = guide.data?.available === true;
  // The News badge: unread notices, kept live by the NoticeListener. Nothing shows for 0.
  const unread = useUnreadCount().data;
  return (
    <Tabs screenOptions={{ headerShown: false, ...tabBar }}>
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
