import { dashboardCopy, parentPageCopy, timeline } from "@jarso/core/dashboard";
import { useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native";
import { Card, Eyebrow, ScreenHeader } from "@/components/screen";
import { Text } from "@/components/ui";
import { useFamilyDue } from "@/features/allowance";
import { useSession } from "@/features/auth";
import {
  ChildrenList,
  FirstChildCard,
  useDashboard,
  useFamily,
  useFamilySummary,
} from "@/features/family";
import { useParentRequests } from "@/features/requests";
import { todayLine } from "@/lib";
import { keys } from "@/lib/query";
import { NeedsYouCard } from "./needs-you-card";
import { ScreenState } from "./screen-state";
import { TimelineCard } from "./timeline-card";

/**
 * The parent's Family home (mockup C, the web's parent Home made calm): the date over "Your
 * family", then "Needs you" (requests and handovers, each with its action), Jarso's summary when
 * there is one, the children as rows and the next two weeks. The web's filter, chart and other
 * dashboard sections stay on the web. Settings opens from the tab header (one place on every tab).
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
            <Card accessibilityLabel={dashboardCopy.summaryLabel}>
              <Eyebrow>{dashboardCopy.summaryEyebrow}</Eyebrow>
              <Text>{summaryText}</Text>
            </Card>
          ) : null}
          {dashboard.data ? (
            <>
              <ChildrenList items={dashboard.data.children} currency={currency} />
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
