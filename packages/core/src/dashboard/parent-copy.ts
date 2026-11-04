import { formatDay } from "@jarso/core/allowance";
import type { GoalView } from "@jarso/core/goals";

// The parent's dashboard. Moved word for word from the web components so the phone says the
// same.

export const dashboardCopy = {
  timelineTitle: "Next two weeks",
  timelineEmpty: "Nothing planned for the next two weeks.",
  summaryLabel: "Jarso's summary",
  summaryEyebrow: "Jarso's summary · written by AI from the figures below",
  summaryTitle: "Jarso's summary",
  /** Under the summary: who wrote it, and from what. */
  summaryNote: "Jarso is an AI. This was written by AI from your children's learning this week.",
  childrenTitle: "Children",
  due: " due",
  spend: "Spend ",
  save: "Save ",
  noGoal: "No goal yet",
  addChild: "Add a child",
} as const;

/** Headings and intros of the parent's pages, where they are not owned by one feature's copy. */
export const parentPageCopy = {
  family: "Your family",
  children: "Children",
  /** Home, when nothing waits: the one line, and where to look around. */
  quiet: "Nothing needs you right now.",
  lookAround: "See how the children are learning",
  /** Home's capped list: the rest are on the Money page. */
  more: (count: number) => `and ${count} more`,
  thisWeek: "This week",
  handedOver: "Handed over",
  stillDue: "Still to hand over",
  nextUp: "Next up",
  nothingComing: "Nothing in the next two weeks",
  inbox: "Notifications",
  allowance: "Allowance",
  /** The money tab (2026-11-04): allowances, the chart, spending and activity in one place. */
  money: "Money",
  moneyIntro: "Allowances, spending and how the jars moved, for the whole family.",
  allowances: "Allowances",
  settings: "Settings",
  /** The child page's title before the child's nickname is known. */
  child: "Your child",
  historyTitle: "History",
  /** How a skipped allowance reads to a parent. */
  notGiven: "Not given",
  seeAll: "See all",
  seeAllHistory: "See all history",
  allowanceFor: (nickname: string) => `Allowance for ${nickname}`,
  /** A gift page's title before the child's nickname is known. */
  gift: "Gift",
  giftFor: (nickname: string) => `Gift for ${nickname}`,
  giftNewIntro: "A one-time gift. Set it for today to hand it over straight away.",
  giftEditIntro: "Change this gift.",
  handOverTo: (nickname: string) => `Hand over to ${nickname}`,
  history: (nickname: string) => `${nickname}'s history`,
  historyEmpty: (nickname: string) => `${nickname}'s money story starts here.`,
  learning: (nickname: string) => `${nickname}'s learning`,
  learningIntro:
    "Learning progress is kept apart from money. It shows understanding, not how much is saved.",
  chats: (nickname: string) => `${nickname}'s chats with Jarso`,
  chatsIntro:
    "Every chat, newest first, with any that need a look at the top. Text is kept for 30 days.",
  chatsBack: (nickname: string) => `${nickname}'s chats`,
  chatFlaggedIntro:
    "This chat had a safety or rule response. A message that got a safety response stays private: talking to your child kindly is the best next step.",
} as const;

/** `YYYY-MM-DD` as "Sun 1 Nov". */
export function weekday(isoDate: string): string {
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
  return `${day} ${formatDay(isoDate)}`;
}

/** A child tile's goal line: "🚲 Bike: £4 of £20", "🚲 Bike: reached", or no goal yet. */
export function goalLine(view: GoalView, money: (minor: number) => string): string {
  if (!view) return dashboardCopy.noGoal;
  return view.progress.reached
    ? `${view.goal.emoji} ${view.goal.name}: reached`
    : `${view.goal.emoji} ${view.goal.name}: ${money(view.progress.countedMinor)} of ${money(view.goal.targetMinor)}`;
}
