// Raw learning content (architecture §5.3). Validated and typed by `@/features/learning`, which is
// the only importer; everything here is plain JSON so it stays reviewable in PRs.
import checkIn from "./check-in.json";
import mission1 from "./missions/1-whats-in-spend.json";
import mission2 from "./missions/2-small-buys-add-up.json";
import mission3 from "./missions/3-spend-and-save.json";
import mission4 from "./missions/4-how-many-weeks.json";
import mission5 from "./missions/5-this-or-that.json";
import mission6 from "./missions/6-plans-change.json";
import mission7 from "./missions/7-put-it-together.json";
import reviewsChangingPlans from "./reviews/changing-plans.json";
import reviewsSavingGoal from "./reviews/saving-goal.json";
import reviewsSpending from "./reviews/spending.json";
import reviewsSplitting from "./reviews/splitting.json";
import reviewsTradeoffs from "./reviews/tradeoffs.json";
import topicChangingPlans from "./topics/changing-plans.json";
import topicSavingGoal from "./topics/saving-goal.json";
import topicSpending from "./topics/spending.json";
import topicSplitting from "./topics/splitting.json";
import topicTradeoffs from "./topics/tradeoffs.json";

export const rawMissions: unknown[] = [
  mission1,
  mission2,
  mission3,
  mission4,
  mission5,
  mission6,
  mission7,
];

export const rawTopics: unknown[] = [
  topicSpending,
  topicSplitting,
  topicSavingGoal,
  topicTradeoffs,
  topicChangingPlans,
];

export const rawReviews: unknown[] = [
  ...reviewsSpending,
  ...reviewsSplitting,
  ...reviewsSavingGoal,
  ...reviewsTradeoffs,
  ...reviewsChangingPlans,
];

export const rawCheckIn: unknown = checkIn;
