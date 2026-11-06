import { useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { HouseIcon, MapIcon, NotebookPenIcon, SparklesIcon } from "lucide-react-native";
import { tabIcon as icon, PlusTabButton, useTabBarOptions } from "@/components/screen";
import { useGuideState } from "@/features/guide";

// Home · Learn · + · Diary · Jarso. The + opens "What happened?"; the inbox, Requests and Me are
// stack screens (the bell and avatar on Home).

/** The child's tabs. The role guard is in the parent `(child)/_layout`. */
export default function TabsLayout() {
  const tabBar = useTabBarOptions();
  // The Jarso tab shows only once the server says the guide is on for this child.
  const guide = useGuideState();
  const guideOn = guide.data?.available === true;
  const router = useRouter();
  return (
    <Tabs screenOptions={{ headerShown: false, ...tabBar }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon(HouseIcon) }} />
      <Tabs.Screen name="learn" options={{ title: "Learn", tabBarIcon: icon(MapIcon) }} />
      <Tabs.Screen
        name="plus"
        options={{
          title: "",
          tabBarButton: () => <PlusTabButton onPress={() => router.push("/(child)/add")} />,
        }}
      />
      <Tabs.Screen name="diary" options={{ title: "Diary", tabBarIcon: icon(NotebookPenIcon) }} />
      <Tabs.Screen
        name="jarso"
        options={{
          title: "Jarso",
          tabBarIcon: icon(SparklesIcon),
          href: guideOn ? undefined : null,
        }}
      />
    </Tabs>
  );
}
