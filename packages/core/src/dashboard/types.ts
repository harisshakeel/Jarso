import type { DueItem, Gift, Schedule } from "@jarso/core/allowance";
import type { GoalView } from "@jarso/core/goals";
import type { BalanceHistory, HistoryItem } from "@jarso/core/ledger";

/**
 * One child as the parent's dashboard reads them: everything the family-wide sections need,
 * read once. Amounts are minor units; dates are family-local ISO `YYYY-MM-DD`.
 */
export type DashboardChild = {
  id: string;
  nickname: string;
  /**
   * The child's fixed colour on the dashboard, 1 to 8, by the family's child order (never by
   * rank, so a filter never repaints anyone). 0 past the eighth child: drawn in a neutral tone.
   */
  slot: number;
  spendMinor: number;
  saveMinor: number;
  /** Save promised to withdrawals waiting to be handed over. */
  reservedMinor: number;
  goal: GoalView;
  schedule: Schedule | null;
  /** Handovers waiting for a parent (allowances and gifts due by today). */
  due: DueItem[];
  /** Gifts the parent planned, pending. */
  gifts: Gift[];
  /** Newest first, back to at least the start of the comparison window. */
  history: HistoryItem[];
  /** Where both jars stood each day, or null when that read failed. */
  balances: BalanceHistory | null;
  /** Jarso chats flagged for the parent this week (a safety or personal-details reply). */
  flaggedChats: number;
};

/** Everything the parent's dashboard shows, read once per child. */
export type FamilyDashboard = {
  currency: string;
  timezone: string;
  today: string;
  /** In the family's child order, each with their fixed colour slot. */
  children: DashboardChild[];
};

/** A period the dashboard looks at, in days back from today, with the one before it. */
export type DashboardWindow = {
  days: number;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
};

/** The family's (or one child's) money at a glance. */
export type DashboardTotals = {
  children: number;
  spendMinor: number;
  saveMinor: number;
  /** Allowances and gifts handed over since Monday. */
  handedOver: number;
  /** Allowances and gifts due by today and not handed over yet. */
  waiting: number;
  waitingMinor: number;
};

/** One spending category, this period against the one before. */
export type CategoryRow = {
  key: string;
  emoji: string;
  label: string;
  nowMinor: number;
  beforeMinor: number;
};

/** A history line with the child it belongs to, for the merged activity list. */
export type TaggedItem = { childId: string; nickname: string; slot: number; item: HistoryItem };

/** Something coming up in the next two weeks. */
export type TimelineEvent = {
  date: string;
  childId: string;
  nickname: string;
  slot: number;
  kind: "allowance" | "gift" | "goal";
  /** The line as the parent reads it: "Allowance, £5.00", "Could reach 🚲 Bike". */
  text: string;
};

/** What a callout offers to do, mapped to a page by the app. */
export type CalloutAction = "limit" | "allowance" | "goal" | "chats";

/** One plain observation about one child, never compared with another child. */
export type Callout = {
  id: string;
  childId: string;
  nickname: string;
  slot: number;
  text: string;
  action: CalloutAction | null;
  /** Save grew: what the child put in themselves over the period (`savedByChild`), to match. */
  matchMinor: number | null;
};

/** One child's band in the money chart: Save underneath, Spend on top, one value per date. */
export type MoneySeries = {
  childId: string;
  nickname: string;
  slot: number;
  save: number[];
  spend: number[];
};

export type MoneyChartData = {
  /** Oldest first, ending today. */
  dates: string[];
  series: MoneySeries[];
  /** The first date of the current period, where the chart marks "This week"; null for none. */
  splitAt: string | null;
};
