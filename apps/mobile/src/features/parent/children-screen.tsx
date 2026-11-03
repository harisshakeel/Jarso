import { dashboardCopy } from "@jarso/core/dashboard";
import { familySettingsCopy } from "@jarso/core/family";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
import { ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { ChildrenList, FirstChildCard, useDashboard } from "@/features/family";
import { ScreenState } from "./screen-state";

/**
 * The Children tab (mockup C): every child as a row with their total and Spend · Save split,
 * each opening the child's hub, then "Add a child". With no children, the first-child card.
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
          <ChildrenList items={children} currency={currency} title={false} />
          <Button
            variant="secondary"
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
