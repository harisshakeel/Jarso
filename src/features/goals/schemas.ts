import { z } from "zod";
import { formatMoney, moneySchema } from "@/lib";
import { GOAL_EMOJI } from "./emoji";

/** Largest goal price in minor units; the database caps it too. */
export const MAX_GOAL_MINOR = 1_000_000;

export const goalIdSchema = z.object({ goalId: z.uuid("We couldn't find that.") });

/** The goal sheet: a name, an emoji, a price and an optional plan per allowance. */
export const goalInputSchema = (currency: string) =>
  z
    .object({
      name: z.string().trim().min(1, "Give your goal a name.").max(40, "Keep it to 40 characters."),
      emoji: z.enum(GOAL_EMOJI, { error: "Pick a picture for your goal." }),
      target: moneySchema(currency).refine((minor) => minor <= MAX_GOAL_MINOR, {
        message: `Pick a price up to ${formatMoney(MAX_GOAL_MINOR, currency, { showMinor: "nonzero" })}.`,
      }),
      plan: z.preprocess(
        (value) => (value === undefined ? "" : value),
        moneySchema(currency, { allowZero: true, allowEmpty: true }),
      ),
    })
    .transform(({ target, plan, ...rest }) => ({
      ...rest,
      targetMinor: target,
      planMinor: plan,
    }));
