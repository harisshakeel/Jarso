import { upcomingGifts } from "@jarso/core/allowance";
import { childCardLine, parentPageCopy, weekMissions } from "@jarso/core/dashboard";
import type { ChildSummary, Family } from "@jarso/core/family";
import { parentGuideCopy } from "@jarso/core/guide";
import { parentLearningCopy } from "@jarso/core/learning";
import type { HistoryItem } from "@jarso/core/ledger";
import { jarsoFill } from "@jarso/core/mascot";
import { rulesCopy } from "@jarso/core/rules";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlagIcon } from "lucide-react-native";
import { Fragment, useEffect, useMemo } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Card, CardSeparator, ListRow } from "@/components/screen";
import { Text } from "@/components/ui";
import {
  AllowanceCard,
  DueList,
  GiftList,
  useChildDue,
  useChildGifts,
  useChildGoal,
  useChildSchedule,
} from "@/features/allowance";
import { useSession } from "@/features/auth";
import { SendNoteSheet, useChildProgress, useFamily } from "@/features/family";
import { useParentGuideState } from "@/features/guide";
import { ParentRequestItems, useParentRequests } from "@/features/requests";
import { dayOfDate, familyToday, formatMoney, useTokens } from "@/lib";
import { keys } from "@/lib/query";
import { goalTile, MoneyTiles } from "./child-card";
import { ScreenState } from "./screen-state";
import {
  useChild,
  useChildJars,
  useChildLearning,
  useFlaggedChats,
  useRecentHistory,
} from "./use-child";

const RECENT = 5;
const UNAVAILABLE = "We couldn't load this just now. Pull down to try again.";

/**
 * One child (the web's child page, its three tabs as one calm scroll): jars and "Send a note",
 * what waits on the parent, the allowance, gifts, rules, learning, Jarso and the newest history.
 * An id that is not one of the parent's children goes back to Children, with no read made with it.
 */
export function ChildHubScreen({ childId }: { childId: string }) {
  const router = useRouter();
  const family = useFamily();
  const child = useChild(childId);
  const unknown = Boolean(family.data && !child);

  useEffect(() => {
    if (unknown) router.replace("/(parent)/(tabs)/children");
  }, [unknown, router]);

  if (!family.data || !child) {
    return (
      <ScreenState error={unknown ? null : family.error} onRetry={() => void family.refetch()} />
    );
  }
  return <Hub child={child} family={family.data.family} />;
}

function Hub({ child, family }: { child: ChildSummary; family: Family }) {
  const router = useRouter();
  const client = useQueryClient();
  const { userId } = useSession();
  const { id: childId, nickname } = child;
  const { currency, timezone } = family;
  const base = `/(parent)/children/${childId}` as const;

  const children = useMemo(() => [child], [child]);
  const jars = useChildJars(childId);
  const requests = useParentRequests(children);
  const due = useChildDue(childId);
  const schedule = useChildSchedule(childId);
  const gifts = useChildGifts(childId);

  const refreshing = jars.isRefetching || due.isRefetching;
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.child(childId) });
    void client.invalidateQueries({ queryKey: keys.familyRequests(userId ?? "") });
  };

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <ChildHero
        childId={childId}
        nickname={nickname}
        currency={currency}
        timezone={timezone}
        jars={jars.data}
        failed={Boolean(jars.error)}
      />

      {requests.data && requests.data.items.length > 0 ? (
        <ParentRequestItems items={requests.data.items} currency={currency} />
      ) : null}
      {requests.data && requests.data.failed.length > 0 ? (
        <Text className="text-small text-muted-foreground">
          We couldn't load {nickname}'s requests just now. Pull down to try again.
        </Text>
      ) : null}

      {due.data ? <DueList childId={childId} items={due.data} currency={currency} /> : null}
      {due.error ? <Text className="text-muted-foreground">{UNAVAILABLE}</Text> : null}

      {schedule.isSuccess ? (
        <AllowanceCard childId={childId} schedule={schedule.data} currency={currency} />
      ) : schedule.error ? (
        <Text className="text-muted-foreground">{UNAVAILABLE}</Text>
      ) : null}

      {gifts.data ? (
        <GiftList
          childId={childId}
          gifts={upcomingGifts(gifts.data, familyToday(timezone))}
          currency={currency}
        />
      ) : null}

      <Card className="rounded-3xl py-1">
        <ListRow label={rulesCopy.title} onPress={() => router.push(`${base}/rules`)} />
      </Card>

      <LearningCard childId={childId} nickname={nickname} timezone={timezone} />
      <GuideCard childId={childId} nickname={nickname} />
      <RecentHistory
        childId={childId}
        nickname={nickname}
        currency={currency}
        timezone={timezone}
      />
    </ScrollView>
  );
}

/**
 * The top of the child's page (the rework's look, calm): their Jarso in their own look, level,
 * streak and the week's missions in one line, the three money tiles, then "Send a note".
 */
function ChildHero({
  childId,
  nickname,
  currency,
  timezone,
  jars,
  failed,
}: {
  childId: string;
  nickname: string;
  currency: string;
  timezone: string;
  jars: { spend: number; save: number } | undefined;
  failed: boolean;
}) {
  const progress = useChildProgress(childId);
  const learning = useChildLearning(childId, timezone);
  const goal = useChildGoal(childId);
  const money = (minor: number | undefined) =>
    minor === undefined ? "…" : formatMoney(minor, currency, { showMinor: "nonzero" });
  const line = childCardLine({
    level: progress.data?.level ?? null,
    streak: progress.data?.streak ?? null,
    missions: learning.data ? weekMissions(learning.data.journey) : null,
  });
  const fill = jarsoFill({
    saveMinor: jars?.save ?? 0,
    spendMinor: jars?.spend ?? 0,
    goalTargetMinor: goal.data?.goal.targetMinor ?? null,
  });
  return (
    <View className="gap-3 rounded-3xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-tint-grape">
          <Jarso size={64} fill={fill} look={progress.data?.look} />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="font-sans-extrabold text-h2"
          >
            {nickname}
          </Text>
          {line ? <Text className="text-small text-muted-foreground">{line}</Text> : null}
        </View>
      </View>
      <MoneyTiles
        spend={money(jars?.spend)}
        save={money(jars?.save)}
        goal={goal.isSuccess ? goalTile(goal.data) : "…"}
      />
      {failed ? <Text className="text-small text-muted-foreground">{UNAVAILABLE}</Text> : null}
      <SendNoteSheet childId={childId} nickname={nickname} />
    </View>
  );
}

/** The web's LearningSummaryCard: missions done and this week's learning days. */
function LearningCard({
  childId,
  nickname,
  timezone,
}: {
  childId: string;
  nickname: string;
  timezone: string;
}) {
  const router = useRouter();
  const learning = useChildLearning(childId, timezone);
  // Learning is kept apart from money and hides itself on error, as on the web.
  if (!learning.data) return null;
  const done = learning.data.journey.filter((mission) => mission.status === "done").length;
  const days = learning.data.daysThisWeek;
  return (
    <Card className="gap-1 rounded-3xl">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {parentLearningCopy.title}
      </Text>
      <Text>
        {`${parentLearningCopy.missionsDone(done, learning.data.journey.length)} ${
          days === 0
            ? parentLearningCopy.notYetThisWeek(nickname)
            : parentLearningCopy.learnedOn(days)
        }`}
      </Text>
      <ListRow
        label={parentLearningCopy.seeProgress}
        onPress={() => router.push(`/(parent)/children/${childId}/learning`)}
      />
    </Card>
  );
}

/** Jarso for this child: on or off, chats worth a look, and the way to read them. */
function GuideCard({ childId, nickname }: { childId: string; nickname: string }) {
  const router = useRouter();
  const tokens = useTokens();
  const state = useParentGuideState();
  const configured = state.data?.configured === true;
  const flagged = useFlaggedChats(childId, configured);
  if (!state.data) return null;
  if (!configured) {
    return <Text className="text-muted-foreground">{parentGuideCopy.notConfigured}</Text>;
  }
  const on = state.data.enabledChildIds.includes(childId);
  const count = flagged.data ?? 0;
  return (
    <Card className="gap-1 rounded-3xl">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {parentGuideCopy.cardTitle}
      </Text>
      <Text className="text-muted-foreground">
        {parentGuideCopy.switchLabel(nickname)}: {on ? parentGuideCopy.on : parentGuideCopy.off}
      </Text>
      {count > 0 ? (
        <View className="flex-row items-center gap-2">
          <FlagIcon size={16} color={tokens["gold-text"]} />
          <Text className="font-sans-semibold text-gold-text">
            {parentGuideCopy.flagged(count)}
          </Text>
        </View>
      ) : null}
      <ListRow
        label={parentGuideCopy.readChats(nickname)}
        onPress={() => router.push(`/(parent)/children/${childId}/guide`)}
      />
    </Card>
  );
}

/** The amount a history line shows: none for a missed allowance, "x of y" for a short one. */
function amountOf(item: HistoryItem, currency: string): string | null {
  if (item.amountMinor === null) return null;
  const given = formatMoney(item.amountMinor, currency, { showMinor: "always" });
  return item.dueMinor === null
    ? given
    : `${given} of ${formatMoney(item.dueMinor, currency, { showMinor: "always" })}`;
}

/** The newest five history lines as the parent sees them (exact amounts), then the full list. */
function RecentHistory({
  childId,
  nickname,
  currency,
  timezone,
}: {
  childId: string;
  nickname: string;
  currency: string;
  timezone: string;
}) {
  const router = useRouter();
  const history = useRecentHistory(childId, timezone);
  const items = history.data?.items.slice(0, RECENT) ?? [];
  return (
    <Card className="gap-1 rounded-3xl">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {parentPageCopy.history(nickname)}
      </Text>
      {history.error ? (
        <Text className="text-muted-foreground">
          We couldn't load the history just now. Pull down to try again.
        </Text>
      ) : history.data && items.length === 0 ? (
        <Text className="text-muted-foreground">{parentPageCopy.historyEmpty(nickname)}</Text>
      ) : null}
      {items.map((item) => {
        const amount = amountOf(item, currency);
        const label = item.kind === "skipped" ? parentPageCopy.notGiven : item.label;
        const detail = `${dayOfDate(item.occurredOn)}${item.undone ? " · Undone" : ""}`;
        return (
          <Fragment key={`${item.kind}-${item.id}`}>
            <ListRow
              label={label}
              detail={detail}
              trailing={amount ? <Text className="font-sans-bold text-money">{amount}</Text> : null}
            />
            <CardSeparator />
          </Fragment>
        );
      })}
      <ListRow
        label={parentPageCopy.seeAll}
        accessibilityLabel={parentPageCopy.seeAllHistory}
        onPress={() => router.push(`/(parent)/children/${childId}/history`)}
      />
    </Card>
  );
}
