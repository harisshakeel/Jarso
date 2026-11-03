import { parentRequestCopy, requestSentence } from "@jarso/core/requests";
import { randomUUID } from "expo-crypto";
import { Fragment, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { CardSeparator } from "@/components/screen";
import { useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { actionErrorMessage, flash, formatMoney } from "@/lib";
import {
  type FamilyRequestItem,
  useCancelHandover,
  useCompleteRequest,
  useDecideRequest,
  useRejectDeposit,
} from "./use-parent-requests";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "20 minutes ago", "yesterday", "3 days ago": when the child asked. */
function timeAgo(iso: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(iso).getTime());
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  return relative.format(-Math.floor(elapsed / DAY), "day");
}

/**
 * The requests waiting on the parent, as rows of the "Needs you" card (the web's
 * ParentRequestItems): the web's sentence, when it was asked, and the row's own actions. Nothing
 * to show, nothing drawn.
 */
export function ParentRequestItems({
  items,
  currency,
}: {
  items: FamilyRequestItem[];
  currency: string;
}) {
  return items.map((item, index) => (
    <Fragment key={item.request.id}>
      {index > 0 ? <CardSeparator /> : null}
      <ParentRequestRow item={item} currency={currency} />
    </Fragment>
  ));
}

function ParentRequestRow({ item, currency }: { item: FamilyRequestItem; currency: string }) {
  const { childId, nickname, request } = item;
  const decide = useDecideRequest();
  const complete = useCompleteRequest();
  const reject = useRejectDeposit();
  const cancel = useCancelHandover();
  const once = useSendOnce();
  // One key for this row's Confirm, kept across retries.
  const [idempotencyKey] = useState(() => randomUUID());
  const [error, setError] = useState<string>();
  const pending = decide.isPending || complete.isPending || reject.isPending || cancel.isPending;
  const amount = formatMoney(request.amountMinor, currency, { showMinor: "always" });
  const sentence = requestSentence(request, nickname, amount);
  const ids = { childId, requestId: request.id };

  /** Runs one write, then says what happened in the web's calm words. */
  const run = (write: () => Promise<string | null>) =>
    once(async () => {
      setError(undefined);
      try {
        const line = await write();
        if (line) flash(line);
      } catch (cause) {
        setError(await actionErrorMessage(cause));
      }
    });

  const onDecide = (approve: boolean) =>
    run(async () => {
      const result = await decide.mutateAsync({ ...ids, approve });
      if (result === "over_available") {
        setError(parentRequestCopy.overAvailable);
        return null;
      }
      if (result === "already_decided") return parentRequestCopy.settled;
      return result === "approved"
        ? parentRequestCopy.approved(amount, nickname)
        : parentRequestCopy.rejected;
    });

  const onComplete = (done: string) =>
    run(async () => {
      const result = await complete.mutateAsync({ ...ids, idempotencyKey });
      return result === "completed" ? done : parentRequestCopy.settled;
    });

  const onRejectDeposit = () =>
    run(async () => {
      const result = await reject.mutateAsync(ids);
      return result === "rejected" ? parentRequestCopy.depositRejected : parentRequestCopy.settled;
    });

  const onCancel = () =>
    Alert.alert(parentRequestCopy.didntHandOverTitle, parentRequestCopy.didntHandOverBody, [
      { text: parentRequestCopy.goBack, style: "cancel" },
      {
        text: parentRequestCopy.didntHandOverConfirm,
        onPress: () =>
          void run(async () => {
            const result = await cancel.mutateAsync(ids);
            return result === "cancelled" ? parentRequestCopy.cancelled : parentRequestCopy.settled;
          }),
      },
    ]);

  let primary: { label: string; onPress: () => void };
  let secondary: { label: string; onPress: () => void; ghost?: boolean };
  if (request.kind === "deposit") {
    primary = {
      label: parentRequestCopy.confirm,
      onPress: () => void onComplete(parentRequestCopy.depositDone),
    };
    secondary = { label: parentRequestCopy.didntGetIt, onPress: () => void onRejectDeposit() };
  } else if (request.status === "approved") {
    primary = {
      label: parentRequestCopy.confirm,
      onPress: () => void onComplete(parentRequestCopy.handedOver),
    };
    secondary = { label: parentRequestCopy.didntHandOver, onPress: onCancel, ghost: true };
  } else {
    primary = { label: parentRequestCopy.approve, onPress: () => void onDecide(true) };
    secondary = { label: parentRequestCopy.notNow, onPress: () => void onDecide(false) };
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="min-w-0 flex-1 font-sans-bold">{sentence}</Text>
        <Text className="font-sans-bold text-money">{amount}</Text>
      </View>
      <Text className="text-small text-muted-foreground">{timeAgo(request.occurredAt)}</Text>
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          accessibilityLabel={primary.label}
          accessibilityHint={sentence}
          accessibilityState={{ busy: pending, disabled: pending }}
          disabled={pending}
          onPress={primary.onPress}
        >
          {pending ? <ActivityIndicator color="white" /> : <Text>{primary.label}</Text>}
        </Button>
        <Button
          className="flex-1"
          variant={secondary.ghost ? "ghost" : "outline"}
          accessibilityLabel={secondary.label}
          accessibilityHint={sentence}
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={secondary.onPress}
        >
          <Text>{secondary.label}</Text>
        </Button>
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
