import { z } from "zod";
import { moneySchema } from "@/lib";

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
