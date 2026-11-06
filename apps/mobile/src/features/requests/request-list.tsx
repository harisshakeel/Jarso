import {
  heldLine,
  type RequestStatus,
  requestAlreadyMovedOnMessage,
  type SavingsRequest,
  statusLabel,
  trackerCopy,
  trackerSteps,
} from "@jarso/core/requests";
import { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { AskTracker } from "@/features/flows";
import { useHome } from "@/features/jars";
import { useParentLabel } from "@/features/progress";
import { PushPermissionCard } from "@/features/push";
import { actionErrorMessage, dayInZone, formatMoney, toUserMessage } from "@/lib";
import { cn } from "@/lib/utils";
import { useCancelRequest, useRequests } from "./use-requests";

const OPEN: RequestStatus[] = ["pending", "approved"];

/** "Today, 4:10 pm" style: the day and the time in the family's timezone. */
function whenInZone(iso: string, timeZone: string): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(iso));
  return `${dayInZone(iso, timeZone)}, ${time}`;
}

const kindTitle = (kind: SavingsRequest["kind"], m: string) =>
  kind === "deposit" ? `Save ${m}` : kind === "withdrawal" ? `Use ${m} savings` : `Extra ${m}`;

const WHAT = { withdrawal: "Take out", deposit: "Put in", emergency: "Extra" } as const;

const CHIP: Record<RequestStatus, string> = {
  pending: "bg-gold-100 text-gold-700",
  approved: "bg-cyan-100 text-cyan-700",
  handed_over: "bg-teal-100 text-teal-800",
  confirmed: "bg-teal-100 text-teal-800",
  rejected: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

/** The child's take-outs and put-ins, newest first. A Waiting one can be cancelled. */
export function RequestList() {
  const parent = useParentLabel();
  const requests = useRequests();
  const home = useHome();
  const refetching = requests.isRefetching || home.isRefetching;
  const refresh = () => {
    void requests.refetch();
    if (home.error) void home.refetch();
  };

  if ((requests.isPending || home.isPending) && !requests.error && !home.error) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading your requests" />
      </SafeAreaView>
    );
  }

  if (!requests.data || !home.data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-6 px-6">
          <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
            {toUserMessage(requests.error ?? home.error)}
          </Text>
          <Button size="lg" accessibilityLabel="Try again" onPress={refresh}>
            <Text>Try again</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const { currency, timezone } = home.data.context;
  const open = requests.data.filter((r) => OPEN.includes(r.status));
  const closed = requests.data.filter((r) => !OPEN.includes(r.status));
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        testID="requests-scroll"
        contentContainerClassName="gap-4 px-4 pt-4 pb-10"
        refreshControl={<RefreshControl refreshing={refetching} onRefresh={refresh} />}
      >
        <ScreenHeader title={trackerCopy.title} />
        {requests.data.length === 0 ? (
          <View className="items-center gap-2 py-6">
            <Text className="font-sans-bold">{trackerCopy.empty}</Text>
            <Text className="text-center text-muted-foreground">
              When you move money or ask for extra, it shows up here.
            </Text>
          </View>
        ) : (
          <>
            <PushPermissionCard title={`Want to hear when ${parent} answers?`} />
            {open.map((request) => (
              <OpenAsk
                key={request.id}
                request={request}
                parent={parent}
                currency={currency}
                timezone={timezone}
              />
            ))}
            {closed.map((request) => (
              <ClosedAsk
                key={request.id}
                request={request}
                currency={currency}
                timezone={timezone}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ClosedAsk({
  request,
  currency,
  timezone,
}: {
  request: SavingsRequest;
  currency: string;
  timezone: string;
}) {
  const m = formatMoney(request.amountMinor, currency, { showMinor: "nonzero" });
  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-card p-3">
      <View className="min-w-0 flex-1">
        <Text className="font-sans-bold">{kindTitle(request.kind, m)}</Text>
        <Text className="text-small text-muted-foreground">
          {dayInZone(request.occurredAt, timezone)}
        </Text>
      </View>
      <Text
        className={cn("rounded-full px-3 py-1 text-caption font-sans-bold", CHIP[request.status])}
      >
        {statusLabel(request.kind, request.status)}
      </Text>
    </View>
  );
}

function OpenAsk({
  request,
  parent,
  currency,
  timezone,
}: {
  request: SavingsRequest;
  parent: string;
  currency: string;
  timezone: string;
}) {
  const cancel = useCancelRequest();
  const sendOnce = useSendOnce();
  const [note, setNote] = useState<{ text: string; bad: boolean }>();
  const what = WHAT[request.kind];
  const amount = formatMoney(request.amountMinor, currency, { showMinor: "nonzero" });
  const steps = trackerSteps(request, amount, parent, whenInZone(request.occurredAt, timezone));

  const onCancel = () =>
    sendOnce(async () => {
      setNote(undefined);
      try {
        const result = await cancel.mutateAsync(request.id);
        setNote({
          text: result === "already_closed" ? requestAlreadyMovedOnMessage : trackerCopy.cancelled,
          bad: false,
        });
      } catch (error) {
        setNote({ text: await actionErrorMessage(error), bad: true });
      }
    });

  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {kindTitle(request.kind, amount)}
      </Text>
      {steps ? <AskTracker steps={steps} /> : null}
      {request.kind === "deposit" && request.status === "pending" ? (
        <Text className="text-muted-foreground">{heldLine(amount)}</Text>
      ) : null}
      {request.status === "pending" ? (
        <Button
          variant="ghost"
          accessibilityLabel={`Cancel ${what.toLowerCase()} of ${amount}`}
          accessibilityState={{ busy: cancel.isPending, disabled: cancel.isPending }}
          disabled={cancel.isPending}
          onPress={() => void onCancel()}
        >
          {cancel.isPending ? <ActivityIndicator /> : <Text>{trackerCopy.cancel}</Text>}
        </Button>
      ) : null}
      {note ? (
        <View accessibilityLiveRegion="polite">
          {note.bad ? (
            <Notice calm message={note.text} />
          ) : (
            <Text className="text-primary">{note.text}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
