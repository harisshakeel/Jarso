import {
  allowanceSummaryCopy,
  cadenceAfterAmount,
  formatDay,
  runningSchedule,
  type Schedule,
} from "@jarso/core/allowance";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, View } from "react-native";
import { Card } from "@/components/screen";
import { HomeWait, Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { useFamily } from "@/features/family";
import { AutoChargeSlot } from "@/features/payments";
import { actionErrorMessage, flash, formatMoney } from "@/lib";
import { AllowanceForm } from "./allowance-form";
import { PauseSheet } from "./pause-sheet";
import { useFamilyContext, useResumeAllowance, useStopAllowance } from "./use-allowance-mutations";
import { useChildSchedule } from "./use-schedule";

/**
 * One child's allowance (the web's allowance pages): what runs now with Change, Pause or Resume
 * and Stop, or the form to set one up when nothing runs.
 */
export function AllowanceScreen({ childId }: { childId: string }) {
  const router = useRouter();
  const family = useFamily();
  const context = useFamilyContext();
  const schedule = useChildSchedule(childId);
  const [changing, setChanging] = useState(false);
  const child = family.data?.children.find((item) => item.id === childId);

  if (!child || !context.data || !schedule.isSuccess) {
    return (
      <HomeWait
        error={family.error ?? context.error ?? schedule.error}
        onClose={() => router.back()}
      />
    );
  }

  const { currency, today } = context.data;
  const running = runningSchedule(schedule.data);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/(parent)/children/${childId}`);

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={schedule.isRefetching}
          onRefresh={() => void schedule.refetch()}
        />
      }
    >
      {running && changing ? (
        <AllowanceForm
          childId={childId}
          currency={currency}
          today={today}
          initial={running}
          onDone={() => setChanging(false)}
          onCancel={() => setChanging(false)}
        />
      ) : running ? (
        <Summary
          childId={childId}
          nickname={child.nickname}
          currency={currency}
          today={today}
          schedule={running}
          onChange={() => setChanging(true)}
        />
      ) : (
        // A new allowance goes back to the child's page, as on the web.
        <AllowanceForm childId={childId} currency={currency} today={today} onDone={back} />
      )}
      {running ? <AutoChargeSlot target={{ kind: "schedule", id: running.id }} /> : null}
    </ScrollView>
  );
}

/** Amount, how often, where it stands and the parent's actions. */
function Summary({
  childId,
  nickname,
  currency,
  today,
  schedule,
  onChange,
}: {
  childId: string;
  nickname: string;
  currency: string;
  today: string;
  /** A running or paused schedule. */
  schedule: Schedule;
  onChange: () => void;
}) {
  const resume = useResumeAllowance();
  const stop = useStopAllowance();
  const once = useSendOnce();
  const [error, setError] = useState<string>();
  const paused = schedule.status === "paused";
  const pending = resume.isPending || stop.isPending;
  const input = { childId, scheduleId: schedule.id };

  const run = (write: () => Promise<void>, done: string) =>
    once(async () => {
      setError(undefined);
      try {
        await write();
        flash(done);
      } catch (cause) {
        setError(await actionErrorMessage(cause));
      }
    });

  const onStop = () =>
    Alert.alert(allowanceSummaryCopy.stopTitle(nickname), allowanceSummaryCopy.stopBody, [
      { text: allowanceSummaryCopy.keep, style: "cancel" },
      {
        text: allowanceSummaryCopy.stop,
        style: "destructive",
        onPress: () => void run(() => stop.mutateAsync(input), allowanceSummaryCopy.stopped),
      },
    ]);

  return (
    <>
      <Card>
        <View className="flex-row flex-wrap items-baseline gap-x-2">
          <Text className="font-sans-extrabold text-money-l">
            {formatMoney(schedule.amountMinor, currency)}
          </Text>
          <Text className="font-sans-semibold text-muted-foreground">
            {cadenceAfterAmount(schedule.frequency, schedule.anchorOn)}
          </Text>
        </View>
        {paused ? (
          <>
            <Text className="self-start rounded-full bg-secondary px-3 py-1 font-sans-semibold text-small">
              {allowanceSummaryCopy.paused}
            </Text>
            <Text>
              {schedule.pausedThrough
                ? allowanceSummaryCopy.pausedUntil(
                    formatDay(schedule.pausedThrough),
                    schedule.nextDueOn ? formatDay(schedule.nextDueOn) : null,
                  )
                : allowanceSummaryCopy.pausedOpen}
            </Text>
            {schedule.pauseMessage ? (
              <Text className="text-muted-foreground">{schedule.pauseMessage}</Text>
            ) : null}
          </>
        ) : schedule.nextDueOn ? (
          <Text className="font-sans-semibold">
            {allowanceSummaryCopy.next(formatDay(schedule.nextDueOn))}
          </Text>
        ) : null}
      </Card>

      <Notice message={error} />
      <Button
        size="lg"
        accessibilityLabel={allowanceSummaryCopy.change}
        disabled={pending}
        onPress={onChange}
      >
        <Text>{allowanceSummaryCopy.change}</Text>
      </Button>
      {paused ? (
        <Button
          variant="outline"
          size="lg"
          accessibilityLabel={allowanceSummaryCopy.resume}
          accessibilityState={{ busy: resume.isPending, disabled: pending }}
          disabled={pending}
          onPress={() => void run(() => resume.mutateAsync(input), allowanceSummaryCopy.resumed)}
        >
          {resume.isPending ? <ActivityIndicator /> : <Text>{allowanceSummaryCopy.resume}</Text>}
        </Button>
      ) : (
        <PauseSheet childId={childId} scheduleId={schedule.id} nickname={nickname} today={today} />
      )}
      <Button
        variant="outline"
        size="lg"
        className="border-destructive"
        accessibilityLabel={allowanceSummaryCopy.stop}
        accessibilityState={{ busy: stop.isPending, disabled: pending }}
        disabled={pending}
        onPress={onStop}
      >
        <Text className="text-destructive">{allowanceSummaryCopy.stop}</Text>
      </Button>
    </>
  );
}
