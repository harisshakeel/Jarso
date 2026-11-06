import { dashboardCopy, familyCardsCopy, parentPageCopy, timeline } from "@jarso/core/dashboard";
import { useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Eyebrow, ScreenHeader } from "@/components/screen";
import { Text } from "@/components/ui";
import { useFamilyDue } from "@/features/allowance";
import { useSession } from "@/features/auth";
import { FirstChildCard, useDashboard, useFamily, useFamilySummary } from "@/features/family";
import { PushPermissionCard } from "@/features/push";
import { useParentRequests } from "@/features/requests";
import { todayLine } from "@/lib";
import { keys } from "@/lib/query";
import { ChildCards } from "./child-card";
import { NeedsYouCard } from "./needs-you-card";
import { ScreenState } from "./screen-state";
import { TimelineCard } from "./timeline-card";

/**
 * The parent's Family home (mockup PA1, the rework's look made calm): the date over "Your
 * family", then "Needs you" (each ask a card answered in one tap, each handover a card), Jarso's
 * summary when there is one, a card per child (their Jarso, level, streak, missions and three
 * money tiles) and the next two weeks. No Sparks, no confetti. Settings opens from the tab header.
 */
export function FamilyHomeScreen() {
  const { userId } = useSession();
  const client = useQueryClient();
  const family = useFamily();
  const children = family.data?.children;
  const requests = useParentRequests(children);
  const due = useFamilyDue(children);
  const dashboard = useDashboard(7);
  const summary = useFamilySummary(7);

  const refreshing = family.isRefetching || dashboard.isRefetching;
  const refresh = () => void client.invalidateQueries({ queryKey: keys.family(userId ?? "") });

  if (!family.data) {
    return <ScreenState error={family.error} onRetry={() => void family.refetch()} />;
  }
  const { currency, timezone } = family.data.family;
  const summaryText = summary.data?.text;

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <ScreenHeader overline={todayLine(new Date(), timezone)} title={parentPageCopy.family} />
      <PushPermissionCard />
      {family.data.children.length === 0 ? (
        <FirstChildCard />
      ) : (
        <>
          {requests.data && due.data ? (
            <NeedsYouCard
              requests={requests.data.items}
              failed={requests.data.failed}
              due={due.data}
              currency={currency}
            />
          ) : due.error ? (
            <Text accessibilityRole="alert" className="text-destructive">
              {/* What's due is needed: say it couldn't load rather than "All caught up." */}
              We couldn't load what's due just now. Pull down to try again.
            </Text>
          ) : (
            <ActivityIndicator accessibilityLabel="Loading" />
          )}
          {summaryText ? (
            <View
              accessibilityLabel={dashboardCopy.summaryLabel}
              className="flex-row gap-3 rounded-3xl border border-border bg-card p-4"
            >
              <Jarso mood="happy" size={44} />
              <View className="min-w-0 flex-1 gap-1">
                <Eyebrow>{dashboardCopy.summaryEyebrow}</Eyebrow>
                <Text>{summaryText}</Text>
              </View>
            </View>
          ) : null}
          {dashboard.data ? (
            <>
              <View className="gap-3">
                <Eyebrow header tone="muted">
                  {familyCardsCopy.children}
                </Eyebrow>
                <ChildCards
                  items={dashboard.data.children}
                  currency={currency}
                  timezone={timezone}
                />
              </View>
              <TimelineCard
                events={timeline(dashboard.data.children, dashboard.data.today, currency)}
              />
            </>
          ) : dashboard.error ? (
            <Text accessibilityRole="alert" className="text-muted-foreground">
              We couldn't load your children's money just now. Pull down to try again.
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
