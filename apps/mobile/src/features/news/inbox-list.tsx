import type { Notice, NoticeKind, NoticeRole } from "@jarso/core/notifications";
import { groupNotices, inboxCopy, noticeText, timeAgo } from "@jarso/core/notifications";
import {
  BellIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CreditCardIcon,
  HandCoinsIcon,
  type LucideIcon,
  MessageCircleHeartIcon,
  PencilIcon,
  PiggyBankIcon,
  SparklesIcon,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Eyebrow } from "@/components/screen";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

// The web's tints (design.md §2.5): cyan for due, gold for limits, teal for decisions.
const kindStyle: Record<NoticeKind, { icon: LucideIcon; tint: string }> = {
  allowance_due: { icon: CalendarClockIcon, tint: "bg-cyan-100" },
  handover_reminder: { icon: HandCoinsIcon, tint: "bg-cyan-100" },
  limit_exceeded: { icon: BellIcon, tint: "bg-gold-100" },
  withdrawal_requested: { icon: PiggyBankIcon, tint: "bg-secondary" },
  deposit_requested: { icon: PiggyBankIcon, tint: "bg-secondary" },
  withdrawal_decided: { icon: CheckCircle2Icon, tint: "bg-teal-100" },
  deposit_decided: { icon: CheckCircle2Icon, tint: "bg-teal-100" },
  emergency_requested: { icon: HandCoinsIcon, tint: "bg-gold-100" },
  emergency_decided: { icon: CheckCircle2Icon, tint: "bg-teal-100" },
  card_charge_failed: { icon: CreditCardIcon, tint: "bg-gold-100" },
  money_received: { icon: HandCoinsIcon, tint: "bg-teal-100" },
  entry_corrected: { icon: PencilIcon, tint: "bg-secondary" },
  jar_moved: { icon: PiggyBankIcon, tint: "bg-teal-100" },
  guide_noticed: { icon: SparklesIcon, tint: "bg-secondary" },
  parent_note: { icon: MessageCircleHeartIcon, tint: "bg-cyan-100" },
};

/** One inbox row (design.md §6): tinted icon, title, detail, relative time, chevron. */
function InboxItem({
  notice,
  viewer,
  currency,
  now,
  onOpen,
}: {
  notice: Notice;
  viewer: NoticeRole;
  currency: string;
  now: number;
  onOpen: (notice: Notice) => void;
}) {
  const tokens = useTokens();
  const { icon: Icon, tint } = kindStyle[notice.kind] ?? kindStyle.limit_exceeded;
  const { title, detail } = noticeText(notice, viewer, currency);
  const ago = timeAgo(notice.createdAt, now);
  return (
    <Pressable
      testID="notice-row"
      accessibilityRole="link"
      accessibilityLabel={`${title}${notice.read ? "" : inboxCopy.unread}. ${detail}. ${ago}`}
      onPress={() => onOpen(notice)}
      className={cn(
        "min-h-11 flex-row items-center gap-3 rounded-xl border border-border px-4 py-3",
        notice.read ? "bg-card" : "bg-teal-100",
      )}
    >
      <View className={cn("size-10 items-center justify-center rounded-full", tint)}>
        <Icon size={20} color={tokens["ink-2"]} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className={cn(notice.read ? "font-sans-semibold" : "font-sans-extrabold")}
        >
          {title}
        </Text>
        <Text
          numberOfLines={notice.kind === "parent_note" ? undefined : 1}
          className="text-muted-foreground"
        >
          {detail}
        </Text>
      </View>
      <Text className="text-muted-foreground text-small">{ago}</Text>
      <ChevronRightIcon size={20} color={tokens["muted-foreground"]} />
    </Pressable>
  );
}

/** The inbox, newest first and grouped by day (core `groupNotices`). */
export function InboxList({
  items,
  viewer,
  currency,
  onOpen,
  now = Date.now(),
}: {
  items: Notice[];
  /** Whose inbox: the notice's wording differs for a parent and a child. */
  viewer: NoticeRole;
  currency: string;
  onOpen: (notice: Notice) => void;
  now?: number;
}) {
  return (
    <View className="gap-4">
      {groupNotices(items, now).map((group) => (
        <View key={group.label} accessibilityLabel={group.label} className="gap-2">
          <Eyebrow header tone="muted">
            {group.label}
          </Eyebrow>
          {group.items.map((notice) => (
            <InboxItem
              key={notice.id}
              notice={notice}
              viewer={viewer}
              currency={currency}
              now={now}
              onOpen={onOpen}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
