import { capitalise, PICTURE_TINTS, type PictureIcon, type PictureTint } from "@jarso/core/home";
import type { DepositResult, EmergencyResult, SavingsRequest, WithdrawalResult } from "./types";

// The phone's ask flows (put in, take out, extra), the celebration after one, and the tracker.

export type AskKind = "deposit" | "withdrawal" | "emergency";

/** Only sentence starts are capitalised: "Ask your parent", "Your parent said yes!". */
export function askFlowCopy(parent: string) {
  return {
    deposit: {
      title: "Save some",
      button: (m: string) => `I'll give ${m} to ${parent}`,
      limit: (m: string) => `Spend has ${m}`,
    },
    withdrawal: {
      title: "Use savings",
      forWhat: "For what?",
      button: `Ask ${parent}`,
      limit: (m: string) => `You can ask up to ${m}`,
    },
    emergency: {
      title: "Ask for extra",
      forWhat: "For what?",
      button: `Ask ${parent}`,
      otherHint: "Say what it's for",
    },
  };
}

export type AskReason = {
  key: string;
  label: string;
  icon: PictureIcon;
  tint: PictureTint;
  emoji?: string;
};

const MAX_REASON = 140;

/** The "For what?" picture choices. A savings goal comes first, for withdrawals only. */
export function askReasons(
  kind: "withdrawal" | "emergency",
  goal: { emoji: string; name: string } | null,
): AskReason[] {
  const rest: Omit<AskReason, "tint">[] = [
    { key: "games", label: "Games", icon: "gamepad-2" },
    { key: "gift_for_someone", label: "A gift", icon: "gift" },
    { key: "clothes", label: "Clothes", icon: "shirt" },
    { key: "going_out", label: "Going out", icon: "ticket" },
    { key: "school", label: "School", icon: "pencil-ruler" },
    { key: "other", label: "Other", icon: "ellipsis" },
  ];
  const all: Omit<AskReason, "tint">[] =
    kind === "withdrawal" && goal
      ? [{ key: "goal", label: "My goal", icon: "target", emoji: goal.emoji }, ...rest]
      : rest;
  return all.map((r, i) => ({
    ...r,
    tint: PICTURE_TINTS[i % PICTURE_TINTS.length] as PictureTint,
  }));
}

/** The reason sent with the ask. Other sends what was typed (empty is refused by the schema). */
export function reasonText(
  key: string,
  options: AskReason[],
  typed: string,
  goal: { emoji: string; name: string } | null,
): string {
  if (key === "goal" && goal) return `My goal: ${goal.name}`.slice(0, MAX_REASON);
  if (key === "other") return typed.trim();
  return options.find((o) => o.key === key)?.label ?? "";
}

/** The statuses of an ask that was sent (the over_* results never reach the celebration). */
type Sent<T extends { status: string }> = Extract<T, { requestId: string }>["status"];
export type AskStatusOf = {
  deposit: Sent<DepositResult>;
  withdrawal: Sent<WithdrawalResult>;
  emergency: Sent<EmergencyResult>;
};

/** What the celebration says after an ask, and whether the tracker follows. */
export function askCelebration<K extends AskKind>(
  kind: K,
  status: AskStatusOf[K],
  m: string,
  parent: string,
): { title: string; subtitle?: string; tracked: boolean } {
  const Parent = capitalise(parent);
  if (status === "already_sent") return { title: `Already sent to ${parent}`, tracked: false };
  switch (kind as AskKind) {
    case "deposit":
      return status === "pending"
        ? { title: `Now give ${parent} ${m}`, subtitle: "Then it's in Save", tracked: true }
        : { title: `${m} in Save!`, tracked: false };
    case "withdrawal":
      if (status === "approved") {
        return {
          title: `${Parent} said yes!`,
          subtitle: `${Parent} will hand you ${m}`,
          tracked: true,
        };
      }
      if (status === "done") {
        return { title: `${m} is yours`, subtitle: `${Parent} knows`, tracked: false };
      }
      return { title: `Asked ${Parent}!`, subtitle: `${m} from savings`, tracked: true };
    default:
      return { title: `Asked ${Parent}!`, subtitle: `${m} extra`, tracked: true };
  }
}

export type TrackerStep = { state: "done" | "now" | "next"; title: string; sub?: string };

/** The three steps of an ask. `when` is the app's formatted time ("Today, 4:10 pm"). */
export function trackerSteps(
  request: SavingsRequest,
  m: string,
  parent: string,
  when: string,
): TrackerStep[] | null {
  const { kind, status } = request;
  if (status === "rejected" || status === "cancelled") return null;
  const Parent = capitalise(parent);
  const titles: Pick<TrackerStep, "title" | "sub">[] = [
    { title: "You asked", sub: when },
    kind === "deposit"
      ? { title: `Give ${parent} the ${m}`, sub: "Hand over the cash" }
      : { title: `${Parent} says yes` },
    {
      title:
        kind === "deposit"
          ? "In your Save jar"
          : kind === "withdrawal"
            ? "Cash in your hand"
            : "In your Spend jar",
    },
  ];
  const now = status === "pending" ? 1 : status === "approved" ? 2 : 3;
  return titles.map((t, i) => ({
    ...t,
    state: i < now ? "done" : i === now ? "now" : "next",
  })) as TrackerStep[];
}

/** Under a deposit that is waiting: where the money sits meanwhile. */
export const heldLine = (m: string) => `${m} held in Spend till then`;

export const trackerCopy = {
  cancel: "Cancel this",
  cancelled: "Cancelled",
  title: "My asks",
  empty: "Nothing here yet.",
} as const;
