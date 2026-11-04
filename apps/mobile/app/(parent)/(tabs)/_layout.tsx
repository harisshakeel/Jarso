import { dashboardCopy, parentPageCopy } from "@jarso/core/dashboard";
import { useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { HomeIcon, InboxIcon, SettingsIcon, SparklesIcon, UsersIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { tabIcon as icon, useTabBarOptions } from "@/components/screen";
import { Text } from "@/components/ui";
import { useParentProfile } from "@/features/family";
import { useParentGuideState } from "@/features/guide";
import { useUnreadCount } from "@/features/news";
import { useTokens } from "@/lib";

/**
 * Settings, from the header of every tab (the web's parent nav has it in the header too). It is
 * the parent's avatar (mockup C's, their initial) once their name has loaded, a gear before that
 * or without a name. This is the only Settings button: the screens don't draw their own.
 */
function SettingsButton() {
  const router = useRouter();
  const tokens = useTokens();
  const initial = useParentProfile().data?.fullName?.trim().charAt(0).toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={parentPageCopy.settings}
      onPress={() => router.push("/(parent)/settings")}
      className="mr-2 h-12 w-12 items-center justify-center rounded-full"
    >
      {initial ? (
        <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
          <Text className="font-sans-extrabold">{initial}</Text>
        </View>
      ) : (
        <SettingsIcon size={24} color={tokens["ink-2"]} />
      )}
    </Pressable>
  );
}

const settingsButton = () => <SettingsButton />;

/** The parent's tabs: Family, Children, Jarso, Inbox. The role guard is in `(parent)/_layout`. */
export default function ParentTabsLayout() {
  const tabBar = useTabBarOptions();
  // The Jarso tab shows only once the server says the guide is set up.
  const guideOn = useParentGuideState().data?.configured === true;
  // The Inbox badge: unread notices, kept live by the NoticeListener. Nothing shows for 0.
  const unread = useUnreadCount().data;
  return (
    <Tabs
      screenOptions={{
        ...tabBar,
        headerShown: true,
        headerTitle: "",
        headerShadowVisible: false,
        headerRight: settingsButton,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Family", tabBarIcon: icon(HomeIcon) }} />
      <Tabs.Screen
        name="children"
        options={{ title: dashboardCopy.childrenTitle, tabBarIcon: icon(UsersIcon) }}
      />
      <Tabs.Screen
        name="jarso"
        options={{
          title: "Jarso",
          tabBarIcon: icon(SparklesIcon),
          href: guideOn ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: parentPageCopy.inbox,
          tabBarIcon: icon(InboxIcon),
          tabBarBadge: unread ? unread : undefined,
        }}
      />
    </Tabs>
  );
}
