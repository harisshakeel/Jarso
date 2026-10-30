import { z } from "zod";
import { moneySchema } from "@/lib";

const MAX_LABEL = 60;

/** What the child spent. The key makes a double tap record once. */
export const purchaseSchema = (currency: string) =>
  z
    .object({
      amount: moneySchema(currency),
      label: z
        .string()
        .trim()
        .max(MAX_LABEL, `Keep it to ${MAX_LABEL} characters.`)
        .optional()
        .transform((value) => (value ? value : undefined)),
      idempotencyKey: z.uuid(),
      /** When the child did it, from the device; sent only by the offline outbox. */
      occurredAt: z.iso.datetime({ offset: true }).optional(),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

export const undoSchema = z.object({ entryId: z.uuid("We couldn't find that.") });
