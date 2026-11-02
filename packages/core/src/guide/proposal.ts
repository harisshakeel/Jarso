import { GOAL_EMOJI, type GoalEmoji, MAX_GOAL_MINOR } from "@jarso/core/goals";
import { formatMoney, parseMoney } from "@jarso/core/lib";
import { z } from "zod";

/**
 * A goal Jarso offers (demo 3, "goal by chat"). Jarso proposes; the child decides with a card
 * under the reply, and the app saves the goal through the goals service. Every figure here
 * comes from the tool's validated arguments (what the child said, or what a photo showed),
 * parsed in code: never from the model's free text.
 */
export type GoalProposal = {
  kind: "goal";
  title: string;
  emoji: GoalEmoji;
  priceMinor: number;
  saveEachMinor: number | null;
  /** About how many allowances at `saveEachMinor`, from the app's maths; null when unknown. */
  allowances: number | null;
  /** The figures as one line in the family's currency: "£120 · £5 each allowance". */
  figures: string;
};

/** The `propose_goal` arguments as the model gives them and as the reply stores them. */
export const proposedGoalArgsSchema = z.strictObject({
  title: z.string().trim().min(1).max(40),
  price: z.string().trim().min(1).max(20),
  save_each: z.string().trim().max(20).nullable(),
});
export type ProposedGoalArgs = z.infer<typeof proposedGoalArgsSchema>;

/** What a child sends back from the card. The app validates again before saving. */
export const acceptGoalProposalSchema = z.object({
  title: z.string().trim().min(1, "Give your goal a name.").max(40, "Keep it to 40 characters."),
  emoji: z.enum(GOAL_EMOJI),
  priceMinor: z.number().int().positive().max(MAX_GOAL_MINOR),
  saveEachMinor: z.number().int().min(0).max(MAX_GOAL_MINOR).nullable(),
  /** True when the child chose to replace the goal they already have. */
  replace: z.boolean().default(false),
});
export type AcceptGoalProposal = z.infer<typeof acceptGoalProposalSchema>;

/** What the card hears back. */
export type AcceptGoalProposalResult =
  /** `planKept` is false when the plan was more than the allowance, so it was left off. */
  | { status: "saved"; goalId: string; planKept: boolean }
  /** The child already has a different goal; the card offers to replace it. */
  | { status: "has_goal"; existing: string };

const EMOJI_HINTS: [RegExp, GoalEmoji][] = [
  [/\b(football|soccer|ball)\b/i, "⚽"],
  [/\bbasketball\b/i, "🏀"],
  [/\bskate/i, "🛹"],
  [/\b(bike|bicycle|cycle|scooter)\b/i, "🚲"],
  [/\b(game|console|switch|playstation|xbox|controller)\b/i, "🎮"],
  [/\b(headphones|earbuds|airpods|speaker)\b/i, "🎧"],
  [/\b(phone|mobile)\b/i, "📱"],
  [/\b(laptop|computer|tablet|ipad)\b/i, "💻"],
  [/\bcamera\b/i, "📷"],
  [/\bguitar\b/i, "🎸"],
  [/\b(piano|keyboard)\b/i, "🎹"],
  [/\b(art|paint|pencils|markers|drawing)\b/i, "🎨"],
  [/\b(book|books|comic|manga)\b/i, "📚"],
  [/\b(trainers|sneakers|shoes|boots)\b/i, "👟"],
  [/\b(shirt|hoodie|jacket|jersey|kit|clothes)\b/i, "👕"],
  [/\b(bag|backpack)\b/i, "🎒"],
  [/\bwatch\b/i, "⌚"],
  [/\b(toy|plush|lego)\b/i, "🧸"],
  [/\b(ticket|tickets|concert|match|cinema)\b/i, "🎟️"],
  [/\b(pizza|food|treat)\b/i, "🍕"],
  [/\b(present|gift)\b/i, "🎁"],
  [/\b(camp|tent|trip)\b/i, "🏕️"],
  [/\b(dog|puppy|cat|kitten|pet|hamster)\b/i, "🐶"],
];

/** A picture for a goal from its name; a star when nothing fits. */
export function emojiForGoal(title: string): GoalEmoji {
  for (const [pattern, emoji] of EMOJI_HINTS) if (pattern.test(title)) return emoji;
  return "⭐";
}

/**
 * The card's proposal from stored or fresh tool arguments. Null when an amount can't be read or
 * is over the goal cap, so a bad argument never reaches a card.
 */
export function goalProposalFrom(
  args: ProposedGoalArgs,
  currency: string,
  allowances: number | null = null,
): GoalProposal | null {
  const priceMinor = parseMoney(args.price, currency);
  if (!priceMinor || priceMinor > MAX_GOAL_MINOR) return null;
  let saveEachMinor: number | null = null;
  if (args.save_each !== null && args.save_each !== "") {
    saveEachMinor = parseMoney(args.save_each, currency);
    if (!saveEachMinor || saveEachMinor > MAX_GOAL_MINOR) return null;
  }
  return makeGoalProposal(
    { title: args.title.trim(), priceMinor, saveEachMinor, allowances },
    currency,
  );
}

/** A proposal with its picture and its line of figures. */
export function makeGoalProposal(
  input: Pick<GoalProposal, "title" | "priceMinor" | "saveEachMinor" | "allowances">,
  currency: string,
): GoalProposal {
  return {
    kind: "goal",
    ...input,
    emoji: emojiForGoal(input.title),
    figures: describeProposal(input, currency),
  };
}

/** One line of figures for the card: "£120 · £5 each allowance · about 14 allowances". */
export function describeProposal(
  proposal: Pick<GoalProposal, "priceMinor" | "saveEachMinor" | "allowances">,
  currency: string,
): string {
  const parts = [formatMoney(proposal.priceMinor, currency, { showMinor: "nonzero" })];
  if (proposal.saveEachMinor) {
    parts.push(
      `${formatMoney(proposal.saveEachMinor, currency, { showMinor: "nonzero" })} each allowance`,
    );
  }
  if (proposal.allowances !== null && proposal.allowances > 0) {
    parts.push(
      proposal.allowances === 1 ? "about 1 allowance" : `about ${proposal.allowances} allowances`,
    );
  }
  return parts.join(" · ");
}
