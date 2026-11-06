import { type AskCardKind, askCard, parentRequestCopy } from "@jarso/core/requests";
import { randomUUID } from "expo-crypto";
import { BanknoteIcon, HandCoinsIcon, type LucideIcon, PiggyBankIcon } from "lucide-react-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { actionErrorMessage, cn, flash, formatMoney, useTokens } from "@/lib";
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

type Answer = "yes" | "no";

/** Money coming in is gold (Save); a decision or cash to hand over is teal (action). */
const LOOK: Record<AskCardKind, { Icon: LucideIcon; tint: string }> = {
  receive: { Icon: PiggyBankIcon, tint: "bg-tint-gold" },
  decide: { Icon: HandCoinsIcon, tint: "bg-tint-teal" },
  handover: { Icon: BanknoteIcon, tint: "bg-tint-teal" },
};

/**
 * The requests waiting on the parent, one card each, answered in one tap (mobile kid rework,
 * plan 10): "Got it" / "Not yet" for a put-in, "Yes" / "Not now" for an ask, "Handed over" /
 * "Didn't give it" for an approved take-out. The writes, keys and messages are the web's
 * ParentRequestItems'. Nothing to show, nothing drawn.
 */
export function ParentRequestItems({
  items,
  currency,
}: {
  items: FamilyRequestItem[];
  currency: string;
}) {
  return items.map((item) => (
    <ParentRequestRow key={item.request.id} item={item} currency={currency} />
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
  // Which answer was tapped, so only that button spins.
  const [pressed, setPressed] = useState<Answer | null>(null);
  const tokens = useTokens();
  const pending = decide.isPending || complete.isPending || reject.isPending || cancel.isPending;
  const amount = formatMoney(request.amountMinor, currency, { showMinor: "always" });
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

  const card = askCard(request, nickname, amount);
  const answers: Record<Answer, () => void> =
    card.kind === "receive"
      ? {
          yes: () => void onComplete(parentRequestCopy.depositDone),
          no: () => void onRejectDeposit(),
        }
      : card.kind === "handover"
        ? { yes: () => void onComplete(parentRequestCopy.handedOver), no: onCancel }
        : { yes: () => void onDecide(true), no: () => void onDecide(false) };
  const { Icon, tint } = LOOK[card.kind];

  return (
    <View className="gap-3 rounded-3xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className={cn("h-11 w-11 items-center justify-center rounded-2xl", tint)}
        >
          <Icon size={22} color={tokens["ink-2"]} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-sans-bold text-h3">{card.title}</Text>
          <Text className="text-small text-muted-foreground">
            {`${card.line} · ${timeAgo(request.occurredAt)}`}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        {(["yes", "no"] as const).map((answer) => (
          <Button
            key={answer}
            className="flex-1"
            size="sm"
            variant={answer === "yes" ? "keycap" : "keycap-white"}
            accessibilityLabel={card[answer]}
            accessibilityHint={card.title}
            loading={pending && pressed === answer}
            disabled={pending}
            onPress={() => {
              setPressed(answer);
              answers[answer]();
            }}
          >
            <Text>{card[answer]}</Text>
          </Button>
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
