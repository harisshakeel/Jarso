import { dashboardCopy } from "@jarso/core/dashboard";
import { familySettingsCopy } from "@jarso/core/family";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
import { ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { FirstChildCard, useDashboard } from "@/features/family";
import { ChildCards } from "./child-card";
import { ScreenState } from "./screen-state";

/**
 * The Children tab: every child as a card (their Jarso, level, streak, missions, Spend, Save and
 * goal), each opening the child's hub, then "Add a child". With no children, the first-child card.
 */
export function ChildrenScreen() {
  const router = useRouter();
  const dashboard = useDashboard(7);

  if (!dashboard.data) {
    return <ScreenState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  }
  const { children, currency } = dashboard.data;

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={dashboard.isRefetching}
          onRefresh={() => void dashboard.refetch()}
        />
      }
    >
      <ScreenHeader title={dashboardCopy.childrenTitle} />
      {children.length === 0 ? (
        <FirstChildCard />
      ) : (
        <>
          <ChildCards items={children} currency={currency} timezone={dashboard.data.timezone} />
          <Button
            variant="keycap-white"
            accessibilityLabel={familySettingsCopy.addChild}
            onPress={() => router.push("/(parent)/children/new")}
          >
            <Text>{familySettingsCopy.addChild}</Text>
          </Button>
        </>
      )}
    </ScrollView>
  );
}
