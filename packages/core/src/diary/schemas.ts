import { RECEIVED_CATEGORIES, SPEND_CATEGORIES } from "@jarso/core/ledger";
import { moneySchema } from "@jarso/core/lib";
import { z } from "zod";

const MAX_LABEL = 60;

const keysOf = <K extends string>(list: readonly { key: K }[]) =>
  list.map((c) => c.key) as [K, ...K[]];

export const spendCategorySchema = z.enum(keysOf(SPEND_CATEGORIES));
export const receivedCategorySchema = z.enum(keysOf(RECEIVED_CATEGORIES));

const labelSchema = z
  .string()
  .trim()
  .max(MAX_LABEL, `Keep it to ${MAX_LABEL} characters.`)
  .optional()
  .transform((value) => (value ? value : undefined));

/**
 * What the child spent. The key makes a double tap record once. A purchase queued before
 * categories existed has none and records as Other.
 */
export const purchaseSchema = (currency: string) =>
  z
    .object({
      amount: moneySchema(currency),
      category: spendCategorySchema.default("other"),
      label: labelSchema,
      idempotencyKey: z.uuid(),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

/** Money the child got and wrote down, into Spend or Save. */
export const receivedSchema = (currency: string) =>
  z
    .object({
      amount: moneySchema(currency),
      jar: z.enum(["spend", "save"]),
      category: receivedCategorySchema,
      label: labelSchema,
      idempotencyKey: z.uuid(),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

/**
 * A fix to one of the child's own lines. Which category set is valid depends on the line's
 * kind, so SQL decides; the client sends a key from the right set.
 */
export const fixSchema = (currency: string) =>
  z
    .object({
      entryId: z.uuid("We couldn't find that."),
      amount: moneySchema(currency),
      category: z.string().min(1),
      label: labelSchema,
      idempotencyKey: z.uuid(),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

export const undoSchema = z.object({ entryId: z.uuid("We couldn't find that.") });
export const entryIdSchema = undoSchema;
