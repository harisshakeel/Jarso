import {
  type RequestStatus,
  requestAlreadyMovedOnMessage,
  type SavingsRequest,
  statusLabel,
} from "@jarso/core/requests";
import { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen";
import { useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { actionErrorMessage, dayInZone, formatMoney, toUserMessage } from "@/lib";
import { cn } from "@/lib/utils";
import { useCancelRequest, useRequests } from "./use-requests";

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
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        testID="requests-scroll"
        contentContainerClassName="gap-4 px-4 pt-4 pb-10"
        refreshControl={<RefreshControl refreshing={refetching} onRefresh={refresh} />}
      >
        <ScreenHeader title="What you asked for" />
        {requests.data.length === 0 ? (
          <View className="items-center gap-2 py-6">
            <Text className="font-sans-bold">Nothing here yet.</Text>
            <Text className="text-center text-muted-foreground">
              When you move money or ask for extra, it shows up here.
            </Text>
          </View>
        ) : (
          requests.data.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              currency={currency}
              timezone={timezone}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RequestRow({
  request,
  currency,
  timezone,
}: {
  request: SavingsRequest;
  currency: string;
  timezone: string;
}) {
  const cancel = useCancelRequest();
  const sendOnce = useSendOnce();
  const [note, setNote] = useState<{ text: string; bad: boolean }>();
  const what = WHAT[request.kind];
  const amount = formatMoney(request.amountMinor, currency, { showMinor: "nonzero" });
  const label = statusLabel(request.kind, request.status);

  const onCancel = () =>
    sendOnce(async () => {
      setNote(undefined);
      try {
        const result = await cancel.mutateAsync(request.id);
        setNote({
          text: result === "already_closed" ? requestAlreadyMovedOnMessage : "Cancelled",
          bad: false,
        });
      } catch (error) {
        setNote({ text: await actionErrorMessage(error), bad: true });
      }
    });

  return (
    <View className="gap-1 rounded-xl bg-card p-3">
      <View className="flex-row items-center gap-3">
        <Text className="min-w-0 flex-1 font-sans-bold">{what}</Text>
        <Text className="font-sans-bold">{amount}</Text>
        <Text
          className={cn("rounded-full px-3 py-1 text-caption font-sans-bold", CHIP[request.status])}
        >
          {label}
        </Text>
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-muted-foreground">
          {dayInZone(request.occurredAt, timezone)}
          {request.reason ? ` · ${request.reason}` : ""}
        </Text>
        {request.status === "pending" ? (
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel={`Cancel ${what.toLowerCase()} of ${amount}`}
            accessibilityState={{ busy: cancel.isPending, disabled: cancel.isPending }}
            disabled={cancel.isPending}
            onPress={() => void onCancel()}
          >
            {cancel.isPending ? <ActivityIndicator /> : <Text>Cancel</Text>}
          </Button>
        ) : null}
      </View>
      {note ? (
        <Text
          accessibilityRole={note.bad ? "alert" : undefined}
          accessibilityLiveRegion="polite"
          className={note.bad ? "text-destructive" : "text-muted-foreground"}
        >
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}
