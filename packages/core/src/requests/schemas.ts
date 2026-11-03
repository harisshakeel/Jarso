import { MAX_AMOUNT_MINOR, moneySchema } from "@jarso/core/lib";
import { z } from "zod";

const MAX_TEXT = 140;

const optionalText = z
  .string()
  .trim()
  .max(MAX_TEXT, `Keep it to ${MAX_TEXT} characters.`)
  .optional()
  .transform((value) => (value ? value : undefined));

/** Taking money out of Save. The key makes a double tap ask once. */
export const withdrawalSchema = (currency: string) =>
  z
    .object({
      amount: moneySchema(currency),
      reason: optionalText,
      idempotencyKey: z.uuid(),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

/** Asking for extra money (FR15). The reason is required: it is what the parent decides on. */
export const emergencySchema = (currency: string) =>
  z
    .object({
      amount: moneySchema(currency),
      reason: z
        .string()
        .trim()
        .min(1, "Say what it's for.")
        .max(MAX_TEXT, `Keep it to ${MAX_TEXT} characters.`),
      idempotencyKey: z.uuid(),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

/** Putting money into Save. */
export const depositSchema = (currency: string) =>
  z
    .object({ amount: moneySchema(currency), idempotencyKey: z.uuid() })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

export const requestIdSchema = z.object({ requestId: z.uuid("We couldn't find that.") });

/**
 * Taking the allowance-day plan: the amount is the app's own figure in minor units (a form
 * field, so a string to coerce). It is an ordinary deposit, so the database checks it as one.
 */
export const allowancePlanSchema = z.object({
  occurrenceId: z.uuid("We couldn't find that."),
  amountMinor: z.coerce.number().int().min(1).max(MAX_AMOUNT_MINOR),
  idempotencyKey: z.uuid(),
});

/** Dismissing the allowance-day plan for one allowance. */
export const dismissPlanSchema = z.object({ occurrenceId: z.uuid("We couldn't find that.") });

export const decideSchema = z.object({
  requestId: z.uuid("We couldn't find that."),
  // Forms send "true"/"false" strings or booleans; anything else is refused, not read as "no".
  approve: z.union(
    [z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")],
    {
      error: "Choose approve or not now.",
    },
  ),
  note: optionalText,
});

export const rejectDepositSchema = z.object({
  requestId: z.uuid("We couldn't find that."),
  note: optionalText,
});

export const completeSchema = z.object({
  requestId: z.uuid("We couldn't find that."),
  idempotencyKey: z.uuid(),
});
